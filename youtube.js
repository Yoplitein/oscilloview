const videoInfoURL = "https://invidiou.site/api/v1/videos/{}?fields=adaptiveFormats";

function getVideoHash(url)
{
    const re = /^([a-zA-Z0-9_-]{8,16})$|\?v=([a-zA-Z0-9_-]{8,16})|embed\/([a-zA-Z0-9_-]{8,16})|youtu.be\/([a-zA-Z0-9_-]{8,16})/;
    const match = re.exec(url);
    const hash = match.slice(1, 5).reduce((p, v) => p || v);
    
    if(hash === undefined)
        throw new Error("Can't determine video hash");
    
    return hash;
}

async function getFormats(videoHash)
{
    return (await (await fetch(videoInfoURL.replace("{}", videoHash))).json()).adaptiveFormats;
}

function getBestFormat(formats)
{
    formats = formats.filter(f => f.type.startsWith("audio/"));
    
    if(formats.length == 0)
        throw new Error("No audio formats available");
    
    return formats.reduce((p, v) => parseInt(p.bitrate) < parseInt(v.bitrate) ? v : p).url;
}

export async function getAudioURLForVideo(url)
{
    const hash = getVideoHash(url);
    const formats = await getFormats(hash);
    
    return getBestFormat(formats);
}
