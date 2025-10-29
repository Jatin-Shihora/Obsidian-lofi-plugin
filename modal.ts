import { App, Modal } from "obsidian";

export class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Lofi Modal - (Content Coming Soon)");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
