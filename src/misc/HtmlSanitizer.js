// @flow
import DOMPurify from "dompurify"
import {ReplacementImage} from "../gui/base/icons/Icons"

// the svg data string must contain ' instead of " to avoid display errors in Edge
// '#' character is reserved in URL and FF won't display SVG otherwise
export const PREVENT_EXTERNAL_IMAGE_LOADING_ICON = 'data:image/svg+xml;utf8,' + ReplacementImage.replace(/"/g, "'").replace(/#/g, "%23")


class HtmlSanitizer {

	_blockExternalContent: boolean
	_externalContent: string[]
	purifier: IDOMPurify

	constructor() {
		this._blockExternalContent = false
		if (DOMPurify.isSupported) {
			this.purifier = DOMPurify
		} else {
			return
		}
		this.purifier.addHook('afterSanitizeElements', (currentNode, data, config) => {
				// Do something with the current node and return it
				//console.log("afterSanitizeElements", currentNode.constructor, currentNode, data, config, "prevent: ", this._blockExternalContent, "style", currentNode.style)
				if (this._blockExternalContent) {
					this._preventExternalImageLoading(currentNode)
				}

				// remove custom css classes as we do not allow style definitions. custom css classes can be in conflict to our self defined classes.
				// just allow our own "tutanota_quote" class and MsoListParagraph classes for compatibility with Outlook 2010/2013 emails. see main-styles.js
				let allowedClasses = ["tutanota_quote", "MsoListParagraph", "MsoListParagraphCxSpFirst", "MsoListParagraphCxSpMiddle", "MsoListParagraphCxSpLast"]
				if (currentNode.classList) {
					let cl = currentNode.classList;
					for (let i = cl.length; i > 0; i--) {
						if (allowedClasses.indexOf(cl[0]) == -1) {
							cl.remove(cl[0]);
						}
					}
				}
				// set target="_blank" for all links
				if (currentNode.tagName && (
					currentNode.tagName.toLowerCase() === "a"
					|| currentNode.tagName.toLowerCase() === "area"
					|| currentNode.tagName.toLowerCase() === "form")) {
					currentNode.setAttribute('rel', 'noopener noreferrer')
					currentNode.setAttribute('target', '_blank')
				}

				return currentNode;
			}
		)
	}

	/**
	 * Sanitizes the given html.
	 * @param  html The html content to sanitize.
	 * @param  blockExternalContent True if external content should be blocked
	 */
	sanitize(html: string, blockExternalContent: boolean): SanitizeResult {
		const config = this._prepareSanitize(html, blockExternalContent)

		let cleanHtml = this.purifier.sanitize(html, config)
		return {"text": cleanHtml, "externalContent": this._externalContent}
	}

	/**
	 * Sanitizes given HTML. Returns DocumentFragment instead of string.
	 * @param html {string} HTML to sanitize
	 * @param blockExternalContent
	 * @returns {{html: (DocumentFragment|HTMLElement|string), externalContent: string[]}}
	 */
	sanitizeFragment(html: string, blockExternalContent: boolean): {html: DocumentFragment, externalContent: Array<string>} {
		const config: SanitizeConfigBase & {RETURN_DOM_FRAGMENT: true} =
			Object.assign({}, this._prepareSanitize(html, blockExternalContent), {RETURN_DOM_FRAGMENT: true})
		return {html: this.purifier.sanitize(html, config), externalContent: this._externalContent}
	}

	_prepareSanitize(html: string, blockExternalContent: boolean): SanitizeConfigBase {
		// must be set for use in dompurify hook
		this._blockExternalContent = blockExternalContent;
		this._externalContent = []

		return {
			ADD_ATTR: ['target', 'controls'], // for target = _blank, controls for audio element
			ADD_URI_SAFE_ATTR: ['poster'], // for video element
			FORBID_TAGS: ['style'] // prevent loading of external fonts
		}
	}

	_preventExternalImageLoading(htmlNode) {
		if (htmlNode.attributes) {
			this._replaceSrcAttributes(htmlNode);
		}
		if (htmlNode.style) {
			if (htmlNode.style.backgroundImage) {
				//console.log(htmlNode.style.backgroundImage)
				this._replaceStyleImage(htmlNode, "backgroundImage")
				htmlNode.style.backgroundRepeat = "no-repeat"
			}
			if (htmlNode.style.listStyleImage) {
				this._replaceStyleImage(htmlNode, "listStyleImage")
			}
			if (htmlNode.style.content) {
				this._replaceStyleImage(htmlNode, "content")
			}
			if (htmlNode.style.cursor) {
				this._removeStyleImage(htmlNode, "cursor")
			}
			if (htmlNode.style.filter) {
				this._removeStyleImage(htmlNode, "filter")
			}
		}
	}


	_replaceSrcAttributes(htmlNode) {
		let imageSrcAttr = htmlNode.attributes.getNamedItem('src') || htmlNode.attributes.getNamedItem('poster');
		if (imageSrcAttr) {
			this._externalContent.push(imageSrcAttr.value)
			imageSrcAttr.value = PREVENT_EXTERNAL_IMAGE_LOADING_ICON;
			htmlNode.attributes.setNamedItem(imageSrcAttr);
			htmlNode.style["max-width"] = "100px"
		}
	}

	_removeStyleImage(htmlNode, styleAttributeName: string) {
		let value = htmlNode.style[styleAttributeName]
		if (value.match(/url\(/)) {
			this._externalContent.push(value)
			htmlNode.style.removeProperty(styleAttributeName)
		}
	}

	_replaceStyleImage(htmlNode, styleAttributeName: string) {
		let value = htmlNode.style[styleAttributeName]
		if (value.match(/^url\(/)) {
			// remove surrounding url definition. url(<link>)
			value = value.replace(/^url\("*/, "");
			value = value.replace(/"*\)$/, "");
			this._externalContent.push(value)
			let newImage = 'url("' + PREVENT_EXTERNAL_IMAGE_LOADING_ICON + '")'
			htmlNode.style[styleAttributeName] = newImage;
			htmlNode.style["max-width"] = "100px"
		}
	}

}

export const htmlSanitizer: HtmlSanitizer = new HtmlSanitizer()
