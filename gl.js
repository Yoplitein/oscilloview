const floatSizeof = Float32Array.BYTES_PER_ELEMENT;

/** @type {WebGL2RenderingContext} */
let gl = null;

let fftSize = null;
let rightChannelOffset = 0;

// let dummyBuf;
let samplesBuf;
// let quadBuf;

let pointProg;
let pointLayout;

let quadProg;
let quadLayout;

export function init(canvas)
{
    gl = canvas.getContext("webgl2", {
        alpha: true,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        desyncrhonized: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
    });
    window.gl = gl;
    
    if(gl === null)
        throw new Error("Could not create WebGL context, does your device support WebGL 2?");
    
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    
    // dummyBuf = new Buffer();
    samplesBuf = new Buffer();
    // quadBuf = new Buffer();
    
    // dummyBuf.setData(Uint8Array.of(0));
    
    pointProg = new Program("point-vs", "point-fs", ["pointSize", "pointColor"]);
    
    pointProg.use();
    console.log(pointProg.uniforms);
    gl.uniform1f(pointProg.uniforms["pointSize"], 5);
    gl.uniform3f(pointProg.uniforms["pointColor"], 1, 1, 1);
    pointProg.unuse();
    
    // quadProg = new Program("quad-vs", "quad-fs", ["fadeRate"]);
}

export function prepare(_fftSize)
{
    fftSize = _fftSize;
    
    let bufSize = floatSizeof * fftSize * 2;
    const halfSize = floatSizeof * fftSize;
    
    const align = floatSizeof; //gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT);
    const alignOffset = halfSize % align === 0 ? 0 : align - (halfSize % align);
    bufSize += alignOffset;
    rightChannelOffset = halfSize + alignOffset;
    
    /*if(bufSize > gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE))
        throw new Error("Required uniform buffer size exceeds device capability");*/
    
    samplesBuf.setSized(bufSize, gl.STREAM_DRAW);
    // samplesBuf.useIndexed(gl.UNIFORM_BUFFER, 0, 0, halfSize);
    // samplesBuf.useIndexed(gl.UNIFORM_BUFFER, 1, halfSize + alignOffset, halfSize);
    
    pointLayout = new VertexAttrLayout({
        x: {
            buffer: samplesBuf,
            size: 1,
            type: gl.FLOAT,
        },
        y: {
            buffer: samplesBuf,
            size: 1,
            type: gl.FLOAT,
            offset: rightChannelOffset,
        }
    });
}

export function resize(viewportSize)
{
    gl.viewport(0, 0, viewportSize, viewportSize);
    // TODO: recreate framebuffers
}

export function render(now, [chanLeft, chanRight])
{
    samplesBuf.setSubData(chanLeft, 0);
    samplesBuf.setSubData(chanRight, rightChannelOffset);
    
    gl.clearColor((1 + Math.cos(now)) / 2, 0, (1 + Math.sin(now)) / 2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    pointProg.use();
    pointLayout.use();
    gl.drawArrays(gl.POINTS, 0, fftSize);
    pointProg.unuse();
    pointLayout.unuse();
}

class Program
{
    constructor(vsID, fsID, uniforms = [], uniformBlocks = {})
    {
        let vs = this.constructor._compileShader(vsID, gl.VERTEX_SHADER);
        let fs = this.constructor._compileShader(fsID, gl.FRAGMENT_SHADER);
        let prog = this.handle = gl.createProgram();
        
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.validateProgram(prog);
        
        if(!gl.getProgramParameter(prog, gl.LINK_STATUS) || !gl.getProgramParameter(prog, gl.VALIDATE_STATUS))
            throw new Error(`Program with shaders ${vsID}, ${fsID} failed to link or validate: ${gl.getProgramInfoLog(prog)}`)
        
        this.uniforms = {};
        
        for(const name of uniforms)
            this.uniforms[name] = gl.getUniformLocation(prog, name);
        
        for(const blockName in uniformBlocks)
        {
            const binding = uniformBlocks[blockName];
            const index = gl.getUniformBlockIndex(prog, blockName);
            
            if(index != gl.INVALID_INDEX)
                gl.uniformBlockBinding(prog, index, binding);
            else
                console.warn(`Invalid index for uniform block ${blockName} on for program ${vsID}, ${fsID}`)
        }
    }
    
    static _compileShader(id, type)
    {
        let script = document.querySelector(`script#${id}`);
        
        if(script === null)
            throw new Error(`script tag with id ${id} not found`);
        
        let shader = gl.createShader(type);
        gl.shaderSource(shader, script.textContent);
        gl.compileShader(shader);
        
        if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(`Failed to compile shader ${id}: ${gl.getShaderInfoLog(shader)}`);
        
        return shader;
    }
    
    use()
    {
        gl.useProgram(this.handle);
    }
    
    unuse()
    {
        gl.useProgram(null);
    }
}

const _defaultBufferUsageHint = 0x88E4; // GL_STATIC_DRAW, can't reference gl object here >.>
const _bufferScratchTarget = 0x88EC; // ditto for GL_PIXEL_UNPACK_BUFFER

class Buffer
{
    constructor()
    {
        this.handle = gl.createBuffer();
        this.boundTarget = null;
    }
    
    length()
    {
        gl.bindBuffer(_bufferScratchTarget, this.handle);
        let len = gl.getBufferParameter(_bufferScratchTarget, gl.BUFFER_SIZE);
        gl.bindBuffer(_bufferScratchTarget, null);
        return len;
    }
    
    use(target)
    {
        gl.bindBuffer(target, this.handle);
        this.boundTarget = target;
    }
    
    unuse()
    {
        if(this.boundTarget == null) return;
        gl.bindBuffer(this.boundTarget, null);
        this.boundTarget = null;
    }
    
    useIndexed(target, index, offset = 0, size = 0)
    {
        if(size == 0) size = this.length();
        gl.bindBufferRange(target, index, this.handle, offset, size);
    }
    
    setSized(size, usage = _defaultBufferUsageHint)
    {
        gl.bindBuffer(_bufferScratchTarget, this.handle);
        gl.bufferData(_bufferScratchTarget, size, usage);
        gl.bindBuffer(_bufferScratchTarget, null);
    }
    
    setData(buf, usage = _defaultBufferUsageHint)
    {
        gl.bindBuffer(_bufferScratchTarget, this.handle);
        gl.bufferData(_bufferScratchTarget, buf, usage);
        gl.bindBuffer(_bufferScratchTarget, null);
    }
    
    setSubData(buf, offset)
    {
        gl.bindBuffer(_bufferScratchTarget, this.handle);
        const length = gl.getBufferParameter(_bufferScratchTarget, gl.BUFFER_SIZE);
        
        if(buf.length > length - offset)
            throw new Error(`setSubData buffer overflow: trying to write buffer of length ${buf.length} at ${offset} into buffer of size ${length} (only have ${length - offset})`);
        
        gl.bufferSubData(_bufferScratchTarget, offset, buf);
        gl.bindBuffer(_bufferScratchTarget, null);
    }
}

class VertexAttrLayout
{
    constructor(layout)
    {
        let index = 0;
        this.handle = gl.createVertexArray();
        this.use();
        
        for(const attrName in layout)
        {
            const {buffer, size, type} = layout[attrName];
            const normalizeInts = layout[attrName]["normalizeInts"] || false;
            const stride = layout[attrName]["stride"] || 0;
            const offset = layout[attrName]["offset"] || 0;
            const divisor = layout[attrName]["divisor"] || 0;
            
            buffer.use(gl.ARRAY_BUFFER);
            gl.enableVertexAttribArray(index);
            gl.vertexAttribPointer(index, size, type, normalizeInts, stride, offset);
            gl.vertexAttribDivisor(index, divisor);
            buffer.unuse();
            
            index += 1;
        }
        
        this.unuse();
    }
    
    use()
    {
        gl.bindVertexArray(this.handle);
    }
    
    unuse()
    {
        gl.bindVertexArray(null);
    }
}
