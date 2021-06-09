const floatSizeof = Float32Array.BYTES_PER_ELEMENT;

/** @type {WebGL2RenderingContext} */
let gl = null;

let fftSize = null;
let rightChannelOffset = 0;
let drawLines = false;

let samplesBuf;
let quadBuf;

let pointProg;
let pointLayout;

let quadProg;
let quadLayout;
let readTex, writeTex;
let framebuffer;

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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 1);
    
    samplesBuf = new Buffer();
    quadBuf = new Buffer();
    
    quadBuf.setData(Float32Array.of(
        -1.0, +1.0,  0.0, 1.0,
        +1.0, +1.0,  1.0, 1.0,
        -1.0, -1.0,  0.0, 0.0,
        +1.0, -1.0,  1.0, 0.0,
    ));
    
    pointProg = new Program("point-vs", "point-fs", ["pointSize", "pointColor", "flipX", "flipY"]);
    // pointLayout created in prepare, depends on fft size
    
    quadProg = new Program("quad-vs", "quad-fs", ["fadeRate", "tex"]);
    quadLayout = new VertexAttrLayout({
        pos: {
            buffer: quadBuf,
            size: 2,
            type: gl.FLOAT,
            stride: 4 * floatSizeof,
        },
        uv: {
            buffer: quadBuf,
            size: 2,
            type: gl.FLOAT,
            offset: 2 * floatSizeof,
            stride: 4 * floatSizeof,
        }
    });
    
    quadProg.use();
    gl.uniform1i(quadProg.uniforms.tex, 0);
    quadProg.unuse();
    
    writeTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, writeTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    
    framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTex, 0);
    
    readTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
}

export function prepare(_fftSize, pointSize, pointColor, fadeRate, flipX, flipY, _drawLines)
{
    fftSize = _fftSize;
    drawLines = _drawLines;
    
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
    
    pointProg.use();
    gl.uniform1f(pointProg.uniforms.pointSize, pointSize);
    gl.uniform3f(pointProg.uniforms.pointColor, ...pointColor);
    gl.uniform1f(pointProg.uniforms.flipX, flipX);
    gl.uniform1f(pointProg.uniforms.flipY, flipY);
    pointProg.unuse();
    
    quadProg.use();
    gl.uniform1f(quadProg.uniforms.fadeRate, fadeRate);
    quadProg.unuse();
    
    gl.clear(gl.COLOR_BUFFER_BIT);
}    

export function resize(viewportSize)
{
    gl.viewport(0, 0, viewportSize, viewportSize);
    
    const zeros = new Uint8Array(viewportSize ** 2 * 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, viewportSize, viewportSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, zeros);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, writeTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, viewportSize, viewportSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, zeros);
    
    gl.activeTexture(gl.TEXTURE0); // make sure we're always binding to unit 0 in render
}

export function render(now, [chanLeft, chanRight])
{
    samplesBuf.setSubData(chanLeft, 0);
    samplesBuf.setSubData(chanRight, rightChannelOffset);
    
    // draw points into existing image
    pointProg.use();
    pointLayout.use();
    gl.drawArrays(drawLines ? gl.LINE_STRIP : gl.POINTS, 0, fftSize);
    pointLayout.unuse();
    pointProg.unuse();
    
    // blit the intermediate image to the canvas
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, gl.canvas.width, gl.canvas.height, 0, 0, gl.canvas.width, gl.canvas.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    
    // copy freshly-written frame into read texture
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, gl.canvas.width, gl.canvas.height, 0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
    
    // and finally fade out
    quadProg.use();
    quadLayout.use();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    quadLayout.unuse();
    quadProg.unuse();
}

class Program
{
    constructor(vsID, fsID, uniforms = [], uniformBlocks = {})
    {
        const vs = this.constructor._compileShader(vsID, gl.VERTEX_SHADER);
        const fs = this.constructor._compileShader(fsID, gl.FRAGMENT_SHADER);
        const prog = this.handle = gl.createProgram();
        
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
        const script = document.querySelector(`script#${id}`);
        
        if(script === null)
            throw new Error(`script tag with id ${id} not found`);
        
        const shader = gl.createShader(type);
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
        const len = gl.getBufferParameter(_bufferScratchTarget, gl.BUFFER_SIZE);
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
