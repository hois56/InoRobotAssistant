/** Virtual external peer for the robot language's Port/Socket commands.
 * A peer must be configured explicitly. Sending never invents a camera result.
 * Buffers contain bytes; offsets/lengths are not JavaScript UTF-16 indices.
 */
export class OlpSocketService {
    constructor({onChange=null,onSend=null,now=()=>performance.now(),pollMilliseconds=10}={}) {
        this.ports=new Map();this.onChange=onChange;this.onSend=onSend;
        this.now=now;this.pollMilliseconds=pollMilliseconds;
        this.encoder=new TextEncoder();this.decoder=new TextDecoder();
    }
    port(channel) {
        if(!Number.isInteger(channel)||channel<0)throw new RangeError('Socket channel must be a nonnegative integer');
        if(!this.ports.has(channel))this.ports.set(channel,{channel,available:false,connected:false,
            host:'',port:null,mode:null,replyText:null,incoming:[],buffer:new Uint8Array(),lastSent:'',sent:[]});
        return this.ports.get(channel);
    }
    changed(port) {this.onChange?.(this.snapshot(port.channel));}
    configure(channel,{available,replyText}={}) {
        const port=this.port(channel);
        if(available!==undefined){port.available=Boolean(available);if(!port.available)port.connected=false;}
        if(replyText!==undefined)port.replyText=replyText===null?null:String(replyText);
        this.changed(port);return this.snapshot(channel);
    }
    snapshot(channel=2) {
        const port=this.port(channel);
        return {channel,available:port.available,connected:port.connected,host:port.host,port:port.port,mode:port.mode,
            replyText:port.replyText,lastSent:port.lastSent,pendingFrames:port.incoming.length,bufferBytes:port.buffer.length};
    }
    open({host,port:portNumber,channel,mode}) {
        if(typeof host!=='string'||!host.trim()||!Number.isInteger(portNumber)||portNumber<1||portNumber>65535)
            throw new RangeError('Open Socket requires a host and a TCP port in 1..65535');
        const port=this.port(channel);
        Object.assign(port,{host,port:portNumber,mode,connected:port.available});
        this.changed(port);return port.connected?1:0;
    }
    close(channel) {
        const port=this.port(channel);
        port.connected=false;port.mode=null;port.incoming=[];port.buffer=new Uint8Array();
        this.changed(port);
    }
    getState(channel) {
        const port=this.port(channel);
        // A configured virtual peer reconnects to a generated server program.
        // Client programs instead establish the session with Open Socket.
        if(port.available&&!port.mode)port.connected=true;
        return port.connected?1:0;
    }
    send(channel,text,runtime=null) {
        const port=this.port(channel);
        if(!port.connected)throw new Error(`Socket Port[${channel}] is not connected`);
        text=String(text);port.lastSent=text;port.sent.push(text);
        if(port.sent.length>128)port.sent.shift();
        this.onSend?.({channel,text,host:port.host,port:port.port},runtime);
        if(port.replyText!==null)this.inject(channel,port.replyText);
        this.changed(port);
    }
    inject(channel,text) {
        const port=this.port(channel),bytes=this.encoder.encode(String(text));
        if(bytes.length>1048576)throw new RangeError('Virtual socket frame exceeds the simulator buffer limit');
        port.incoming.push(bytes);this.changed(port);
    }
    async receive(channel,timeoutSeconds,runtime=null) {
        timeoutSeconds??=0;
        if(!Number.isFinite(timeoutSeconds)||timeoutSeconds<0)throw new RangeError('Get Port timeout must be nonnegative seconds');
        const port=this.port(channel),start=this.now();
        while(true) {
            if(runtime?.cancelled)throw new Error('OLP stopped');
            await runtime?.waitIfPaused?.();
            if(port.connected&&port.incoming.length) {
                port.buffer=port.incoming.shift();this.changed(port);return true;
            }
            if(timeoutSeconds>0&&this.now()-start>=timeoutSeconds*1000)return false;
            await new Promise(resolve=>setTimeout(resolve,this.pollMilliseconds));
        }
    }
    getBuffer(offset,length,channel) {
        if(!Number.isInteger(offset)||offset<0||!Number.isInteger(length)||length<0)
            throw new RangeError('GetPortbuf offset and length must be nonnegative byte counts');
        return this.decoder.decode(this.port(channel).buffer.slice(offset,offset+length));
    }
    clear(channel) {const port=this.port(channel);port.buffer=new Uint8Array();this.changed(port);}
}
