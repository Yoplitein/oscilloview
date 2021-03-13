const $ = document.querySelector.bind(document);
const canvas = $("canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const fileInput = $("input[type='file']");
const submitButton = $("input[type='submit']");
let imgData = null;
let pixelBuf = null;

let fileURL = null;
let audio = null;
let src = null;

let audioCtx = new AudioContext();
let splitter = audioCtx.createChannelSplitter(2);

let analyserLeft = audioCtx.createAnalyser();
analyserLeft.fftSize = 2 << 14;
let leftBuffer = new Float32Array(analyserLeft.fftSize);

let analyserRight = audioCtx.createAnalyser();
analyserRight.fftSize = analyserLeft.fftSize;
let rightBuffer = new Float32Array(analyserLeft.fftSize);

let merger = audioCtx.createChannelMerger(2);

splitter.connect(analyserLeft, 0);
splitter.connect(analyserRight, 1);
analyserLeft.connect(merger, 0, 0);
analyserRight.connect(merger, 0, 1);
merger.connect(audioCtx.destination);
audioCtx.resume();

function onSubmit() {
    if (fileInput.files.length != 1) {
        alert("one file please");
        return;
    }

    submitButton.disabled = true;
    fileURL = URL.createObjectURL(fileInput.files[0]);
    fileInput.value = "";
    audio = new Audio(fileURL);
    src = audioCtx.createMediaElementSource(audio);

    src.connect(splitter);
    audio.addEventListener("error",
        (e) => {
            alert(e);
            onStopPlaying();
        }
    );
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("ended", onStopPlaying);
}

function onCanPlay() {
    if (audioCtx.state !== "running")
        return;

    document.documentElement.classList.add("playing");
    audio.play();
}

function onStopPlaying() {
    document.documentElement.classList.remove("playing");
    submitButton.disabled = false;

    if (src) {
        src.disconnect();
        src = null;
    }

    if (audio) {
        audio.pause();
        audio = null;
    }

    if (fileURL) {
        URL.revokeObjectURL(fileURL);
        fileURL = null;
    }
}

submitButton.addEventListener("click", onSubmit);
$("button#stop").addEventListener("click", onStopPlaying);

let viewportSize = 0;
let viewportOrigin = [0, 0];

function onResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    viewportSize = Math.min(canvas.width, canvas.height);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    imgData = ctx.createImageData(viewportSize, viewportSize);
    imgBuf = new Uint32Array(imgData.data.buffer);

    imgBuf.fill(0xFF000000);

    if (canvas.width == canvas.height)
        return;

    if (canvas.width > canvas.height)
        viewportOrigin = [canvas.width / 2 - viewportSize / 2, 0];
    else
        viewportOrigin = [0, canvas.height / 2 - viewportSize / 2];
}

let last = 0;

function render(now) {
    now /= 1000;

    requestAnimationFrame(render);
    analyserLeft.getFloatTimeDomainData(leftBuffer);
    analyserRight.getFloatTimeDomainData(rightBuffer);

    const darkenRate = 12;

    /*ctx.fillStyle = `rgb(${darkenRate}, ${darkenRate}, ${darkenRate})`;
    ctx.globalCompositeOperation = "difference";*/

    // ctx.fillStyle = "black";
    // ctx.fillRect(0, 0, viewportSize, viewportSize);

    //ctx.fillStyle = "#13A10E";
    //ctx.globalCompositeOperation = "source-over";

    /*for(let i in imgBuf)
    {
      const byte = i * 4;
      
      for(let chan in [0, 1, 2])
        imgData.data[byte + chan] = Math.max(0, imgData.data[byte + chan] - darkenRate);
    }*/

    if (audio === null) {
        const v = viewportSize / 2;
        const x = Math.round(v + (v * 0.85) * Math.cos(2 * Math.PI * (now / 10)) - 2);
        const y = Math.round(v + (v * 0.85) * Math.sin(2 * Math.PI * (now / 10)) - 2);
        imgBuf[y * viewportSize + x] = 0xFF13A10E;
    }
    else {
        let start = performance.now();
        for (let i in leftBuffer) {
            const normX = leftBuffer[i];
            const normY = rightBuffer[i];
            const unsignedX = (1 + normX) / 2;
            const unsignedY = (1 + normY) / 2;
            const intX = viewportSize - Math.min(Math.max(0, Math.round(unsignedX * viewportSize)), viewportSize);
            const intY = viewportSize - Math.min(Math.max(0, Math.round(unsignedY * viewportSize)), viewportSize);


        }
        let end = performance.now();

        if (now - last >= 1) {
            last = now;
            console.log("draw took ", end - start);
        }
    }

    ctx.putImageData(imgData, ...viewportOrigin);
}

window.addEventListener("resize", onResize);
onResize();
requestAnimationFrame(render);

/*canvas.addEventListener("click", () => {
  console.log(audioCtx);

  analyserLeft.getFloatTimeDomainData(leftBuffer);
  analyserRight.getFloatTimeDomainData(rightBuffer);

  console.log(leftBuffer.slice(0, 10), rightBuffer.slice(0, 10));
});*/
