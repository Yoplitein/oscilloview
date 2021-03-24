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

class Buffer
{
    static _scratchTarget = gl.PIXEL_UNPACK_BUFFER;
    
    constructor()
    {
        this.handle = gl.createBuffer();
        this.boundTarget = null;
    }
    
    length()
    {
        this._useScratch();
        return gl.getBufferParameter(_scratchTarget, gl.BUFFER_SIZE);
    }
    
    _useScratch()
    {
        gl.bindBuffer(_scratchTarget, this.handle);
    }
    
    use(target)
    {
        gl.bindBuffer(target, this.handle);
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
    
    setSized(size, usage)
    {
        this._useScratch();
        gl.bufferData(_scratchTarget, size, usage);
    }
    
    setData(buf, usage)
    {
        this._useScratch();
        gl.bufferData(_scratchTarget, buf, usage);
    }
    
    setSubData(buf, offset)
    {
        this._useScratch();
        
        if(this.length() - offset > buf.length)
            throw new Error("setSubData buffer overflow");
        
        gl.bufferSubData(_scratchTarget, offset, buf);
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
