# Outline Chrome Extension

A Chrome extension that allows you to easily clip and save web content to your Outline wiki. This extension helps you capture and organize web content with just a few clicks, maintaining the original formatting and automatically organizing clips by domain.

## Features

- 🎯 **Quick Clipping**: Select text and right-click to send it directly to your Outline wiki
- 📝 **Markdown Conversion**: Automatically converts web content to clean Markdown format
- 📂 **Smart Organization**: Automatically creates and manages folders by domain
- 📊 **Metadata Preservation**: Captures important metadata like source URL, author, and publication date
- 🎨 **Clean Interface**: Minimal, Apple-style design with smooth animations
- 🔒 **Secure**: Uses API tokens for authentication and secure communication
- ⚡ **Fast & Reliable**: Built with performance and reliability in mind

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

## Configuration

1. Click the extension icon in your Chrome toolbar
2. Enter your Outline instance URL (e.g., `https://yourdomain.com`)
3. Add your API token (can be generated in Outline settings)
4. Click "Save" and "Check Connection" to verify everything works

## Usage

1. Select text on any webpage
2. Right-click and select "Send to Outline"
3. The content will be saved to your Outline wiki in a domain-specific folder
4. Click the notification to open the newly created document

## Development

### Project Structure

```
outline-chrome-extension/
├── background.js        # Service worker for background tasks
├── clipper.js          # Core clipping functionality
├── manifest.json       # Extension manifest
├── options.html        # Settings page
├── styles/            
```

### Key Components

- **Background Service**: Handles context menu integration and global error handling
- **Clipper Module**: Manages content selection, conversion, and sending to Outline
- **Options Page**: User-friendly settings management with connection testing
- **API Module**: Robust API communication with retry logic and error handling

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/baditaflorin/outline-chrome-extension.git
```

2. Load the extension in Chrome:
    - Open `chrome://extensions/`
    - Enable "Developer mode"
    - Click "Load unpacked"
    - Select the extension directory

3. Make changes and reload the extension to test

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Thanks to the Outline team for their amazing wiki platform
- [Turndown](https://github.com/domchristie/turndown) for HTML to Markdown conversion

## Support

If you encounter any issues or have questions, please:

1. Check the [GitHub Issues](https://github.com/baditaflorin/outline-chrome-extension/issues) page
2. Open a new issue if your problem hasn't been reported
3. Provide as much detail as possible, including Chrome version and steps to reproduce

---

### LLM
Extract 
```bash
codexgigantus --ignore-file .DS_Store,.gitignore,LICENSE,icon.png,PRIVACY.md --ignore-ext zip --ignore-dir lib,.git,.idea,.store > chatgpt.txt
```



Made with ❤️ for the Outline community