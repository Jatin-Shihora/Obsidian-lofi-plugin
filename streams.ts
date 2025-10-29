export interface LofiStream {
	id: string;
	name: string;
	url: string;
	description?: string;
}

export const PREDEFINED_LOFI_STREAMS: LofiStream[] = [
	{
		id: "local",
		name: "Local Folder",
		url: "",
		description: "Use MP3 files from the configured local folder.",
	},
	{
		id: "chill-mornings",
		name: "Chill Mornings",
		url: "https://antares.dribbcast.com/proxy/s8280/stream",
		description: "A mellow mix for starting your day.",
	},
	{
		id: "jazzy-afternoons",
		name: "Jazzy Afternoons",
		url: "https://relay0.r-a-d.io/main.mp3",
		description: "Smooth jazz vibes for a productive afternoon.",
	},
	{
		id: "japanese-music",
		name: "Anime & Japanese Music",
		url: "http://tsuiokuyo.ddns.net:8764/lossy",
		description: "Broadcasting anime and Japanese music.",
	},
	{
		id: "lofi-hiphop-radio",
		name: "Lofi Hip Hop Radio",
		url: "https://streams.fluxfm.de/Chillhop/mp3-128/streams.fluxfm.de/",
		description: "24/7 lofi hip hop beats.",
	},
];

export function getStreamById(id: string | null): LofiStream | undefined {
	if (id === null || id === "local") {
		return PREDEFINED_LOFI_STREAMS.find((stream) => stream.id === "local");
	}
	return PREDEFINED_LOFI_STREAMS.find((stream) => stream.id === id);
}
