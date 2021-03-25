import * as gl from "./gl.js";

const $ = document.querySelector.bind(document);
const canvas = $("canvas");

function main()
{
    window.addEventListener("resize", onResize);
    
    gl.init(canvas);
    onResize();
    gl.prepare(views[0].length);
    render(0);
}

document.addEventListener("DOMContentLoaded", main);

function onResize()
{
    let viewportSize = Math.min(window.innerWidth, window.innerHeight);
    canvas.width = canvas.height = viewportSize;

    gl.resize(viewportSize);
}

let noise = new Float32Array(32);
let views = [new Float32Array(noise.buffer, 0, 16), new Float32Array(noise.buffer, 16 * Float32Array.BYTES_PER_ELEMENT, 16)];

window.addEventListener("click", () => {
    for(let i in noise)
        noise[i] = Math.random() * 2 - 1;
    
    console.log(noise);
});
window.dispatchEvent(new MouseEvent("click"));

function render(now)
{
    now /= 1000;
    
    gl.render(now, views);
    requestAnimationFrame(render);
}
