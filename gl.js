/** @type {WebGL2RenderingContext} */
let gl = null;

// let 

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
    
    if(gl === null)
        throw new Error("Could not create WebGL context, does your device support WebGL 2?");
    
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
}

export function resize(viewportSize)
{
    gl.viewport(0, 0, viewportSize, viewportSize);
    // TODO: recreate framebuffers
}

export function render(now, [chanLeft, chanRight])
{
    // TODO
    // console.log(now, chanLeft, chanRight);
}

class Program
{
    constructor(vsID, fsID, uniforms = [], uniformBlocks = {})
    {
        let vs = _compileShader(vsID);
        let fs = _compileShader(fsID);
        let prog = this.handle = gl.createProgram();
        
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.validateProgram(prog);
        
        if(!gl.getProgramParameter(prog, gl.LINK_STATUS) || !gl.getProgramParameter(prog, gl.VALIDATE_STATUS))
            throw new Error(`Program with shaders ${vsID}, ${fsID} failed to link or validate: ${gl.getProgramInfoLog(prog)}`)
        
        this.uniforms = {};
        let indices = gl.getUniformIndices(prog, uniforms);
        uniforms.forEach((name, index) => this.uniforms[name] = indices[index]);
        
        for(const blockName in uniformBlocks)
        {
            const binding = uniformBlocks[blockName];
            const index = gl.getUniformBlockIndex(prog, blockName);
            
            gl.uniformBlockBinding(prog, index, binding);
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
        
        if(!gl.getShaderParameter(gl.COMPILE_STATUS))
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
            const {buffer, size, type} = inputLayout[attrName];
            const stride = inputLayout["stride"] || 0;
            const offset = inputLayout["offset"] || 0;
            const divisor = inputLayout["divisor"] || 0;
            
            buffer.use(gl.ARRAY_BUFFER);
            gl.enableVertexAttribArray(index);
            gl.vertexAttribPointer(index, size, type, stride, offset);
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
