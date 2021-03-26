import * as gl from "./gl.js";

const $ = document.querySelector.bind(document);
const canvas = $("canvas");
const fileInput = $("input[type='file']");
const submitButton = $("input[type='submit']");
const audioElement = new Audio();
const signalBuffers = [null, null];
const analysers = [null, null];
let playing = false;

function main()
{
    submitButton.addEventListener("click", onSubmit);
    $("button#stop").addEventListener("click", onStopPlaying);
    audioElement.addEventListener("canplay", onCanPlay);
    audioElement.addEventListener("ended", onStopPlaying);
    window.addEventListener("resize", onResize);
    
    audioSetup();
    gl.init(canvas);
    onResize();
    gl.prepare(views[0].length);
    render(0);
}

document.addEventListener("DOMContentLoaded", main);

function onResize()
{
    const viewportSize = Math.min(window.innerWidth, window.innerHeight);
    canvas.width = canvas.height = viewportSize;
    
    gl.resize(viewportSize);
}

function onSubmit()
{
    if(fileInput.files.length != 1)
        throw new Error("One file please");
    
    submitButton.disabled = true;
    
    const fileURL = URL.createObjectURL(fileInput.files[0]);
    fileInput.value = "";
    audioElement.src = fileURL;
    
    // without this the blob urls leak
    audioElement.addEventListener("canplay", () => URL.revokeObjectURL(fileURL), { once: true });
    
    // added here to be removed by onStopPlaying -- causes a loop otherwise
    audioElement.addEventListener("error", onError, { once: true });
    
    // analyserLeft.fftSize = analyserRight.fftSize = fftSize;
    // gl.prepare(fftSize);
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
    
    playing = false;
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
