const fftSize = 2 << 10;
const lineColor = [0x13, 0xA1, 0x0E].map(v => v / 255);

const $ = document.querySelector.bind(document);
const canvas = $("canvas");
const gl = canvas.getContext("webgl", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
});
const fileInput = $("input[type='file']");
const submitButton = $("input[type='submit']");
const audioElement = new Audio();
const signalBuffers = [new Float32Array(fftSize), new Float32Array(fftSize)];
const analysers = [null, null];
let viewportSize = 0;

function main()
{
    submitButton.addEventListener("click", onSubmit);
    $("button#stop").addEventListener("click", onStopPlaying);
    audioElement.addEventListener("canplay", onCanPlay);
    audioElement.addEventListener("ended", onStopPlaying);
    window.addEventListener("resize", onResize);

    audioSetup();
    glSetup();
    onResize();
    requestAnimationFrame(render);
}

document.addEventListener("DOMContentLoaded", main);

function onSubmit()
{
    if (fileInput.files.length != 1)
    {
        alert("one file please");
        return;
    }

    submitButton.disabled = true;
    let fileURL = URL.createObjectURL(fileInput.files[0]);
    fileInput.value = "";
    audioElement.src = fileURL;

    // without this the blob urls leak
    audioElement.addEventListener("canplay", () => URL.revokeObjectURL(fileURL), { once: true });

    // added here to be removed by onStopPlaying -- causes a loop otherwise
    audioElement.addEventListener("error", onError, { once: true });
}

function onCanPlay()
{
    document.documentElement.classList.add("playing");
    audioElement.play();
}

function onError()
{
    alert("are you sure that's an audio file? maybe your browser can't read it");
    onStopPlaying();
}

function onStopPlaying()
{
    if (audioElement.src === "")
        return;

    audioElement.removeEventListener("error", onError); // prevent loop
    audioElement.pause();

    audioElement.src = "";
    document.documentElement.classList.remove("playing");
    submitButton.disabled = false;
}

function onResize()
{
    viewportSize = Math.min(window.innerWidth, window.innerHeight);
    canvas.width = canvas.height = viewportSize;

    gl.viewport(0, 0, viewportSize, viewportSize);
}

function audioSetup()
{
    const ctx = new AudioContext();
    const audioSrc = ctx.createMediaElementSource(audioElement);
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const analyserLeft = ctx.createAnalyser();
    const analyserRight = ctx.createAnalyser();
    analysers[0] = analyserLeft;
    analysers[1] = analyserRight;
    analyserLeft.fftSize = analyserRight.fftSize = fftSize;

    // audio -> splitter -> (left analyzer | right analyzer) -> merger -> speakers
    audioSrc.connect(splitter);
    splitter.connect(analyserLeft, 0);
    splitter.connect(analyserRight, 1);
    analyserLeft.connect(merger, 0, 0);
    analyserRight.connect(merger, 0, 1);
    merger.connect(ctx.destination);

    ctx.resume(); // get the pipeline going
}

let prog;
let unifTime;

function glSetup()
{
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(1, 0, 1, 1);

    let vs = gl.createShader(gl.VERTEX_SHADER);
    let fs = gl.createShader(gl.FRAGMENT_SHADER)

    function compile(shader, src)
    {
        gl.shaderSource(shader, src);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(gl.getShaderInfoLog(shader));
    }

    compile(vs, "attribute vec2 pos; attribute vec3 vertColor; varying vec3 color; uniform float time; void main() { color = vertColor; gl_Position = vec4(pos, 0.0, 1.0); }");
    compile(fs, "precision highp float; varying vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }");

    prog = gl.createProgram();

    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.validateProgram(prog);
    gl.useProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) || !gl.getProgramParameter(prog, gl.VALIDATE_STATUS))
        throw new Error(gl.getProgramInfoLog(prog));

    const extent = 0.75;
    let vertices = Float32Array.of(
        -extent, +extent, 1, 0, 0,
        +extent, +extent, 0, 1, 0,
        +extent, -extent, 0, 0, 1,
        -extent, -extent, 1, 1, 0,
    );
    let indices = Uint8ClampedArray.of(
        0, 3, 1,
        1, 3, 2,
    );

    let vbo = gl.createBuffer();
    let ibo = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    const floatSizeof = Float32Array.BYTES_PER_ELEMENT;
    let posLoc = gl.getAttribLocation(prog, "pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 5 * floatSizeof, 0);
    let colLoc = gl.getAttribLocation(prog, "vertColor");
    gl.enableVertexAttribArray(colLoc);
    gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 5 * floatSizeof, 2 * floatSizeof);

    console.log("nattrs", gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES), posLoc);
}

function render(now)
{
    requestAnimationFrame(render);

    now /= 1000;

    gl.clearColor(
        (1 + Math.sin(now)) / 2,
        0,
        (1 + Math.cos(now)) / 2,
        1
    );
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0);
    gl.flush();
    gl.finish();
}

document.documentElement.addEventListener("click", () => {
    let as = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
    let eas = gl.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER, gl.BUFFER_SIZE);

    console.log(as, eas, gl.getError(), gl.getParameter(gl.VIEWPORT));
    //console.log(gl.getBufferData());
});
