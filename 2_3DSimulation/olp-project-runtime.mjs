import {OlpRuntime as ProgramRuntime,createOlpGlobalMemory} from './olp-runtime.mjs?v=20261102-generator-2';
export {BIT_COUNT,BIT_START,WORD_COUNT,WORD_START,OLP_RUNTIME_BUILD,OlpRuntimeError,clampWord,normalizeAddress} from './olp-runtime.mjs?v=20261102-generator-2';

const name=path=>String(path).replaceAll('\\','/').split('/').at(-1).toLowerCase();

class OlpStaticRuntime extends ProgramRuntime {
    constructor(project,adapter,owner,entry) {
        super(project,adapter);this.owner=owner;this.staticEntry=entry;this.staticScans=0;
    }
    async executeFile(path,startBlock=false) {
        if(path!==this.staticEntry||!startBlock)return super.executeFile(path,startBlock);
        while(!this.cancelled&&!this.owner.closingTasks) {
            await super.executeFile(path,true);this.staticScans++;
            if(this.cancelled||this.owner.closingTasks)break;
            // Native type-1 End rewinds without leaving RUN. Yield only the
            // JavaScript execution slice, not the interpreter's running state.
            await this.yieldExecutionSlice();
        }
    }
}

/** An OLP project session: foreground program plus generated cyclic PLC tasks.
 * Controller globals are shared; program locals and call stacks belong to each
 * interpreter. Background tasks cannot dispatch concurrent robot movements.
 */
export class OlpRuntime extends ProgramRuntime {
    constructor(project,adapter={}) {
        const globalMemory=adapter.globalMemory??createOlpGlobalMemory();
        super(project,{...adapter,globalMemory,onStopped:null});
        this.sessionAdapter=adapter;this.globalMemory=globalMemory;
        this.backgroundTasks=[];this.backgroundError=null;this.closingTasks=false;this.sessionStarting=false;
    }
    getSnapshot() {
        return {...super.getSnapshot(),backgroundTasks:(this.backgroundTasks??[]).map(task=>({
            id:task.id,path:task.path,phase:task.runtime.phase,running:task.runtime.running,
            lineNumber:task.runtime.currentLineNumber,lastError:task.runtime.lastError,scans:task.scans
        }))};
    }
    configuredTasks() {
        const entries=this.project?.projectInfo?.MultiTaskInfos??[];
        return entries.filter(entry=>entry.IsActive===true).map(entry=>{
            if(Number(entry.TaskType)!==1)throw this.runtimeError(`Unsupported project task type: ${entry.TaskType}`);
            const requested=String(entry.EnterProgramFile??'');
            const paths=(this.project?.programFiles??[]).filter(path=>name(path)===name(requested));
            if(paths.length!==1)throw this.runtimeError(`Background task program is missing or ambiguous: ${requested}`);
            return {id:entry.TaskId,path:paths[0]};
        });
    }
    async runStatic(task) {
        try {
            await task.runtime.run(task.path);
        } catch(error) {
            if(this.closingTasks||this.cancelled||task.runtime.cancelled)return;
            this.backgroundError=error;
            this.sessionAdapter.log?.(`OLP task ${task.path}: ${error.message}`);
            this.stop();
        }
    }
    createStaticTask(definition) {
        const disallowMotion=()=>{throw new Error('A generated PLC background task cannot dispatch robot motion');};
        const child=new OlpStaticRuntime(this.project,{...this.sessionAdapter,globalMemory:this.globalMemory,taskId:definition.id,
            queueStopMoves:false,move:disallowMotion,jump:disallowMotion,home:disallowMotion,
            cursor:null,status:null,onStopped:null,stopMotion:null},this,definition.path);
        child.robot=this.robot;
        return {...definition,runtime:child,get scans(){return child.staticScans;},promise:null};
    }
    async run(entryPath=null,options={}) {
        if(this.running||this.sessionStarting)return;
        this.sessionStarting=true;this.phase='starting';
        this.closingTasks=false;this.backgroundError=null;this.cancelled=false;
        try {
            // Program/module declarations must exist before any task reads
            // shared state. The interpreter guards once-only global initializers.
            await this.initializeDeclarations?.();
            if(this.cancelled)return;
            this.backgroundTasks=this.configuredTasks().map(def=>this.createStaticTask(def));
            this.backgroundTasks.forEach(task=>{task.promise=this.runStatic(task);});
            this.sessionStarting=false;
            await super.run(entryPath,options);
            this.foregroundCompleted=true;
            if(this.backgroundTasks.length&&!this.cancelled&&!this.backgroundError) {
                // Native type-1 static tasks survive the foreground End.
                this.running=true;this.phase='running';this.notifyCursor();
                await Promise.all(this.backgroundTasks.map(task=>task.promise));
            }
            if(this.backgroundError)throw this.backgroundError;
        } catch(error) {
            const failure=this.backgroundError??error;
            this.lastError=failure.message;this.phase=this.cancelled&&!this.backgroundError?'stopped':'error';
            throw failure;
        } finally {
            this.closingTasks=true;this.sessionStarting=false;
            this.backgroundTasks.forEach(task=>task.runtime.stop());
            await Promise.allSettled(this.backgroundTasks.map(task=>task.promise));
            this.running=false;
            if(this.cancelled&&!this.backgroundError)this.phase='stopped';
            if(this.backgroundError){this.lastError=this.backgroundError.message;this.phase='error';}
            this.notifyCursor();this.sessionAdapter.onStopped?.(this.getSnapshot());
        }
    }
    stop() {
        this.closingTasks=true;
        this.backgroundTasks.forEach(task=>task.runtime.stop());
        return super.stop();
    }
    refreshProgramSources(project=this.project) {
        super.refreshProgramSources(project);
        this.backgroundTasks?.forEach(task=>task.runtime.refreshProgramSources(project));
    }
}
