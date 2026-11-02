import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

export function generateOlpGeneratorCases({repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),optionOverrides={},sourceOverrides={}}={}) {
    const epoch='2026-11-02T00:00:00.000Z';
    class FixedDate extends Date {constructor(...args){super(...(args.length?args:[epoch]));}}
    let counter=0;
    const context=vm.createContext({Date:FixedDate,window:{},document:{addEventListener(){},getElementById(){return{};}},
        console,crypto:{randomUUID:()=>`test-step-${++counter}`}});
    for(const name of ['assets.js','generator.js','app.js'])vm.runInContext(sourceOverrides[name]??fs.readFileSync(path.join(repoRoot,'4_ProjectGenerator',name),'utf8'),context,{filename:`4_ProjectGenerator/${name}`});
    vm.runInContext('globalThis.__generated={Generator,state,ProcessStep,handleGeneratedContent,WorkTypes,WorkMethods,ToolTypes,VisionUses}',context);
    const {Generator:G,state,ProcessStep,handleGeneratedContent}=context.__generated;
    const defaults=structuredClone(state.options),cases=[];
    const make=(No,WorkType,WorkMethod,ToolType,VisionUse='No use',extra={})=>Object.assign(new ProcessStep(No),{
        id:`p${No}`,WorkType,WorkMethod,ToolType,VisionUse,...extra});
    const add=(name,steps,options={})=>cases.push({name,steps,options:{...structuredClone(defaults),...options}});
    const methods={Tray:['Get','Put'],Stage:['Get','Put','Peeling'],MCR:['Get','Put','Check'],Vision:['Get','Put','Check','Calibration'],Trash:['Put']};
    if(JSON.stringify([...context.__generated.WorkTypes])!==JSON.stringify(Object.keys(methods)))
        throw new Error('Project generator work types changed; update the OLP coverage matrix');
    if([...context.__generated.WorkMethods].some(method=>!Object.values(methods).flat().includes(method)))
        throw new Error('Project generator work methods changed; update the OLP coverage matrix');
    for(const[type,list]of Object.entries(methods))for(const method of list) {
        const tools=type==='Trash'||method==='Peeling'?['Gripper']:type==='MCR'&&method==='Check'?['PLC (IO)']:
            type==='Vision'&&['Check','Calibration'].includes(method)?['Vision (Socket)','PLC (IO)']:['Vacuum','Gripper'];
        for(const tool of tools)for(const vision of type==='Trash'||method==='Calibration'?['No use']:
            type==='Vision'&&method==='Check'?['Use - IO','Use - Socket']:['No use','Use - IO','Use - Socket']) {
            add(`step-${String(cases.length+1).padStart(3,'0')}-${type}-${method}-${tool.replace(/\W+/g,'_')}-${vision.replace(/\W+/g,'_')}`,
                [make(1,type,method,tool,vision)],{EnableToolControl:true});
        }
    }
    const branchSteps=()=>[
        make(1,'Tray','Get','Vacuum','Use - IO',{TrayXCount:4,TrayYCount:2,TrayPitchX:-12.25,TrayPitchY:20.5,ExtraWaitCount:2}),
        make(2,'Stage','Put','Gripper','Use - Socket',{ExtraWaitCount:1}),make(3,'Stage','Peeling','Gripper'),
        make(4,'Vision','Check','Vision (Socket)','Use - Socket'),make(5,'Trash','Put','Gripper')];
    for(let flags=0;flags<8;flags++)add(`options-control-${flags}`,branchSteps(),{
        EnableTeachingMode:!!(flags&1),EnableWaitPos:!!(flags&2),EnableProcessBusy:!!(flags&4),EnableToolControl:true,
        ToolControlType:flags%2?'DIO':'PLC_IO',EnableMultiRecipe:true,RecipeCount:3,EnableTcpSpeed:true,EnableTorque:true});
    add('socket-server',branchSteps(),{EnableToolControl:true,VisionConfigs:{p2:{IsClient:false,IpAddress:'127.0.0.1',Port:'5001'},p4:{IsClient:false,IpAddress:'127.0.0.1',Port:'5002'}}});
    add('without-tool-control',branchSteps(),{EnableToolControl:false});
    add('scara-telemetry',[make(1,'Tray','Get','Vacuum')],{RobotName:'IR-S7-60Z20S3-C2LH-INT_01741021',EnableTcpSpeed:true,EnableTorque:true});
    add('single-cell-tray',[make(1,'Tray','Get','Vacuum','No use',{TrayXCount:1,TrayYCount:1})]);
    add('zero-cell-tray',[make(1,'Tray','Get','Vacuum','No use',{TrayXCount:0,TrayYCount:3})]);
    add('process-number-11',[make(11,'Tray','Get','Vacuum','Use - IO')]);
    return cases.map(entry=>{
        entry.options={...entry.options,...optionOverrides};
        state.steps=entry.steps;state.options=entry.options;state.userEdits={};state.labelOverrides={};
        const projectInfo=JSON.parse(G.DataPrj(entry.steps,entry.options,entry.name));
        const files=Object.fromEntries(projectInfo.ProgramFiles.map(name=>[name,handleGeneratedContent(name)]));
        files[`${entry.name}.prj`]=JSON.stringify(projectInfo,null,2);
        for(const name of projectInfo.RobPointFiles)files[`Data/${name}`]=handleGeneratedContent(name);
        for(const name of ['Labels.jsn','UserDefineWarning.jsn','Remote_IO_mapping.dat'])files[`Data/${name}`]=handleGeneratedContent(name);
        return {...entry,steps:entry.steps.map(step=>({...step,ProcessName:step.ProcessName})),projectInfo,files};
    });
}

export async function importGeneratedCase(entry,buildOlpProjectFromFiles) {
    return buildOlpProjectFromFiles(Object.entries(entry.files).map(([name,text])=>({
        name:path.basename(name),relativePath:`${entry.name}/${name}`,text:async()=>text})));
}

/** Controlled external plant for language execution, not a robot motion model.
 * Feedback changes are supplied by this adapter after commanded outputs. They
 * must never be synthesized by the OLP runtime from generator function names.
 */
export function createGeneratedProgramPlant(project,{socketResponse='1.25,-2.5,3.75',torques=[10,20,30,40,50,60],
    currentPositions=[[0,0,0,0,0,0],[3,4,0,0,0,0]],serverConnection=true}={}) {
    const banks={IN:new Uint8Array(65536),OUT:new Uint8Array(65536)};
    const calls={moves:[],homes:[],writes:[],logs:[],socket:[],saved:[],delays:[],torque:[]};
    const labels=project.labels??{};
    const address=value=>typeof value==='object'?value:(()=>{const m=String(value).match(/^(IN|OUT)(W|B)?\[(\d+)\]$/i);return m?{prefix:m[1].toUpperCase()+(m[2]??'').toUpperCase(),index:Number(m[3])}:null;})();
    const location=value=>{const a=address(value);if(!a)throw new Error(`Invalid plant address ${value}`);
        const width=a.prefix.endsWith('W')?16:a.prefix.endsWith('B')?8:1;return{bank:banks[a.prefix.startsWith('IN')?'IN':'OUT'],start:a.index*width,width};};
    const read=value=>{const{bank,start,width}=location(value);let result=0;for(let i=0;i<width;i++)result+=bank[start+i]*2**i;return result;};
    const write=(value,next)=>{const{bank,start,width}=location(value);const number=Number(next)>>>0;for(let i=0;i<width;i++)bank[start+i]=(number>>>i)&1;};
    const findLabel=name=>Object.keys(labels).find(key=>key.toLowerCase()===name.toLowerCase());
    const set=(name,value)=>{const key=findLabel(name);if(!key)throw new Error(`Missing generated label ${name}`);write(labels[key],value);};
    const get=name=>{const key=findLabel(name);return key?read(labels[key]):undefined;};
    const setInt=(name,value)=>{const key=findLabel(name);if(!key)throw new Error(`Missing generated label ${name}`);
        const a=address(labels[key]),number=Number(value)>>>0;write(a,number&0xffff);write({...a,index:a.index+1},number>>>16);};
    let currentPositionIndex=0,connected=false,buffer='';
    const adapter={
        readAddress:a=>read(a),
        writeAddress:(a,value)=>{
            write(a,value);calls.writes.push({address:{...a},value});
            if(!Number(value))return;
            for(const[name,resolved]of Object.entries(labels)){
                if(!/^y/i.test(name)||JSON.stringify(address(resolved))!==JSON.stringify(a))continue;
                const match=name.match(/^y(.+?)_(vac_on|vac_off|grip|ungrip)(?:_REQ)?$/i);
                if(!match)continue;
                const opposite={vac_on:'vac_off',vac_off:'vac_on',grip:'ungrip',ungrip:'grip'}[match[2].toLowerCase()];
                for(const suffix of['','_chk']){
                    const on=findLabel(`x${match[1]}_${match[2]}${suffix}`),off=findLabel(`x${match[1]}_${opposite}${suffix}`);
                    if(on)write(labels[on],1);if(off)write(labels[off],0);
                }
            }
        },
        move:async(motion,expression,speed,_project,runtime,options)=>{
            const target=runtime.getMotionTarget(expression);
            if(!target)throw new Error(`Unresolved generated target ${expression}`);
            calls.moves.push({motion,expression,speed,options,target});
        },
        home:async(index,speed)=>{calls.homes.push({index,speed});},
        delay:async milliseconds=>{calls.delays.push(milliseconds);},
        getCurrentPosition:async()=>[...(currentPositions[Math.min(currentPositionIndex++,currentPositions.length-1)])],
        getTorque:axis=>{calls.torque.push(axis);return torques[axis-1];},
        savePoints:async record=>{calls.saved.push(record);},
        log:text=>calls.logs.push(text),
        socket:{
            open:async request=>{calls.socket.push({kind:'open',...request});connected=true;return 1;},
            close:async channel=>{calls.socket.push({kind:'close',channel});connected=false;buffer='';},
            send:async(channel,text)=>{calls.socket.push({kind:'send',channel,text});},
            receive:async(channel,timeout)=>{calls.socket.push({kind:'receive',channel,timeout});buffer=socketResponse;return true;},
            getState:()=>connected||serverConnection?1:0,
            getBuffer:(offset,length,channel)=>{calls.socket.push({kind:'buffer',offset,length,channel});return buffer.slice(offset,offset+length);},
            clear:channel=>{calls.socket.push({kind:'clear',channel});buffer='';}
        }
    };
    return{adapter,calls,banks,set,get,setInt,read,write};
}
