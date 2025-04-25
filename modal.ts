import { App, Modal } from 'obsidian'; // Import necessary types from obsidian

// Modal class (kept from sample template, can be renamed/modified later if needed)
// Currently not used by the plugin's logic.
export class SampleModal extends Modal { // Export the class so main.ts can import it
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this; // Get the content element of the modal
		contentEl.setText('Lofi Modal - (Content Coming Soon)'); // Set the text content
	}

	onClose() {
		const {contentEl} = this; // Get the content element
		contentEl.empty(); // Clear the content when modal is closed
	}
}