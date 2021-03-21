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
    console.log(now, chanLeft, chanRight);
}
