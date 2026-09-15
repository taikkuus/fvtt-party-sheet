import { ObjectLoopProcessor } from "./object-loop-processor.js";

/**
 * Processor for "uuid-link" data type - dereferences UUID links to documents
 * Supports syntax like: "class => {name}" to access properties of linked documents
 */
export class UuidLinkProcessor extends ObjectLoopProcessor {
  /**
   * Check if a value is a valid UUID or array with any valid UUIDs
   * @param {any} value - The value to check
   * @returns {boolean} True if the value is a UUID or array of UUIDs
   * @private
   */
  isUuid(value) {
    if (Array.isArray(value)) {
      return value.some((val) => this.isUuid(val));
    }
    return foundry.utils.parseUuid(value)?.collection !== undefined;
  }

  /**
   * Override normalizeObjectData to dereference UUIDs instead of treating them as objects
   * Falls back to parent implementation for non-UUID data
   * @param {any} objData - The UUID string, array of UUID strings, or regular object data
   * @returns {Array<Object>} Array of dereferenced document data objects
   */
  normalizeObjectData(objData) {
    // Check if this is UUID data - if not, use parent implementation
    if (!this.isUuid(objData)) {
      return super.normalizeObjectData(objData);
    }

    // Convert single UUID to array for uniform processing
    const uuids = Array.isArray(objData) ? objData : [objData];
    const result = [];

    for (const uuid of uuids) {
      try {
        // @ts-ignore
        const linkedDocument = fromUuidSync(uuid);

        if (!linkedDocument) {
          continue;
        }

        // Convert document to data object for template processing
        const documentData = linkedDocument.toObject ? linkedDocument.toObject() : linkedDocument;
        result.push(documentData);
      } catch (error) {
        console.warn(`Failed to dereference UUID: ${uuid}`, error);
        continue;
      }
    }

    return result;
  }
}
