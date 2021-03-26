import * as gl from "./gl.js";

const $ = document.querySelector.bind(document);
const canvas = $("canvas");
const submitButton = $("input[type='submit']");
const audioElement = new Audio();
const signalBuffers = [null, null];
const analysers = [null, null];
let playing = false;

function main()
{
    $("form").addEventListener("submit", onSubmit);
    $("button#stop").addEventListener("click", onStopPlaying);
    audioElement.addEventListener("canplay", onCanPlay);
    audioElement.addEventListener("ended", onStopPlaying);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("click", onClick);
    
    audioSetup();
    gl.init(canvas);
    onResize();
    prepare(128, 2, [1, 0, 1], false, false);
    render(0);
}

document.addEventListener("DOMContentLoaded", main);

function prepare(fftSize, pointSize, pointColor, fadeRate, flipX, flipY)
{
    console.log("prepare", arguments);
    
    signalBuffers[0] = new Float32Array(fftSize);
    signalBuffers[1] = new Float32Array(fftSize);
    
    gl.prepare(fftSize, pointSize, pointColor, fadeRate, flipX, flipY);
}

function onResize()
{
    const viewportSize = Math.min(window.innerWidth, window.innerHeight);
    canvas.width = canvas.height = viewportSize;
    
    gl.resize(viewportSize);
}

function onSubmit(event)
{
    event.preventDefault();
    const fields = event.target.elements;
    console.log(fields);
    
    if(fields.file.files.length != 1)
        throw new Error("One file please");
    
    submitButton.disabled = true;
    
    const fftSize = parseInt(fields.fftSize.value);
    analysers[0].fftSize = analysers[1].fftSize = fftSize;
    
    const pointSize = parseFloat(fields.pointSize.value);
    const fadeRate = parseFloat(fields.fadeRate.value);
    
    if(pointSize === NaN || fadeRate === NaN)
        throw new Error("that ain't no number I ever heard of!");
    
    if(pointSize < 1)
        throw new Error("ain't nothin' gonna show with points that small!");
    
    if(fadeRate <= 0 || fadeRate > 1)
        throw new Error("that fade rate ain't gonna work fam");
    
    prepare(fftSize, pointSize, parseColor(fields.color.value), fadeRate, fields.flipX.checked, fields.flipY.checked);
    
    const fileURL = URL.createObjectURL(fields.file.files[0]);
    fields.file.value = "";
    audioElement.src = fileURL;

    // without this the blob urls leak
    audioElement.addEventListener("canplay", () => URL.revokeObjectURL(fileURL), { once: true });

    // added here to be removed by onStopPlaying -- causes a loop otherwise
    audioElement.addEventListener("error", onError, { once: true });
}

function parseColor(hexstr)
{
    if(hexstr.length != 6)
        throw new Error("invalid color");
    
    const res = [
        parseInt(hexstr.slice(0, 2), 16),
        parseInt(hexstr.slice(2, 4), 16),
        parseInt(hexstr.slice(4, 6), 16),
    ];
    
    if(res.some(v => v === NaN))
        throw new Error("invalid color");
    
    return res.map(v => v / 255);
}

function onCanPlay()
{
    document.documentElement.classList.add("playing");
    audioElement.play();
    
    playing = true;
}

function onError()
{
    alert("are you sure that's an audio file? your browser doesn't seem to think so");
    onStopPlaying();
}

function onStopPlaying()
{
    if(audioElement.src === "")
        return;
    
    // prevent loop -- clearing src below fires error event before we return,
    //  and onError in turn onError calls onStopPlaying to ensure the upload box is properly reset
    audioElement.removeEventListener("error", onError);
    audioElement.pause();
    
    audioElement.src = "";
    document.documentElement.classList.remove("playing");
    submitButton.disabled = false;
    
    prepare(128, 2, [1, 0, 1], false, false);
    playing = false;
}

let shiftKeyHeld = false;

function onKey(event)
{
    if(event.target !== document.body)
        return;
    
    shiftKeyHeld = event.shiftKey;
}

function onClick(event)
{
    if((event.target !== canvas && event.target !== document.documentElement) || !shiftKeyHeld || !playing)
        return;
    
    const px = event.clientX / window.innerWidth;
    const dest = audioElement.duration * px;
    console.log("seek to ", dest, px);
    audioElement.fastSeek(dest);
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
    
    // audio -> splitter -> (left analyzer | right analyzer) -> merger -> speakers
    audioSrc.connect(splitter);
    splitter.connect(analyserLeft, 0);
    splitter.connect(analyserRight, 1);
    analyserLeft.connect(merger, 0, 0);
    analyserRight.connect(merger, 0, 1);
    merger.connect(ctx.destination);
    
    ctx.resume(); // get the pipeline going
}

function render(now)
{
    now /= 1000;
    
    if(!playing && Math.random() < 0.15)
        for(let buf of signalBuffers)
            for(let i in buf)
                buf[i] = Math.random() * 2 - 1;
    else if(playing)
    {
        analysers[0].getFloatTimeDomainData(signalBuffers[0]);
        analysers[1].getFloatTimeDomainData(signalBuffers[1]);
    }
    
    gl.render(now, signalBuffers);
    requestAnimationFrame(render);
}
