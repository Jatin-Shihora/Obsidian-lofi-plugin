import { App, Modal } from "obsidian";

export class LofiModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Lofi modal (content coming soon)");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
