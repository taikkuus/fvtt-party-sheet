/* eslint-disable jest/no-conditional-expect */
// eslint-disable-next-line no-shadow
import { jest } from "@jest/globals";
import { UuidLinkProcessor } from "../src/module/parsing/processors/uuid-link-processor.js";
import { setupFoundryMocks, cleanupFoundryMocks, createConsoleMocks } from "./test-mocks.js";

describe("UuidLinkProcessor", () => {
  let processor;
  let mockParserEngine;
  let consoleMocks;

  beforeEach(() => {
    setupFoundryMocks();
    consoleMocks = createConsoleMocks();

    // Mock the parseUuid function
    global.foundry = global.foundry || {};
    global.foundry.utils = global.foundry.utils || {};
    global.foundry.utils.parseUuid = jest.fn();

    // Mock parser engine
    mockParserEngine = {
      parseText: jest.fn().mockReturnValue([false, "parsed_text"]),
    };

    processor = new UuidLinkProcessor(mockParserEngine);

    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupFoundryMocks();
    consoleMocks.restore();
  });

  describe("isUuid method", () => {
    it("should return true for a valid single UUID string", () => {
      foundry.utils.parseUuid.mockReturnValue({ collection: "Actor" });

      const result = processor.isUuid("Actor.12345");

      expect(result).toBe(true);
      expect(foundry.utils.parseUuid).toHaveBeenCalledWith("Actor.12345");
    });

    it("should return false for an invalid value", () => {
      foundry.utils.parseUuid.mockReturnValue({}); // Missing collection property

      const result = processor.isUuid(123);

      expect(result).toBe(false);
    });

    it("should return true for an array containing at least one valid UUID", () => {
      // First call returns invalid, second call returns valid
      foundry.utils.parseUuid.mockReturnValueOnce(null).mockReturnValueOnce({ collection: "Item" });

      const result = processor.isUuid(["invalid", "Item.67890"]);

      expect(result).toBe(true);
      expect(foundry.utils.parseUuid).toHaveBeenCalledTimes(2);
    });

    it("should return false for an array containing no valid UUIDs", () => {
      foundry.utils.parseUuid.mockReturnValue({});

      const result = processor.isUuid(["invalid1", "invalid2"]);

      expect(result).toBe(false);
    });
  });

  describe("normalizeObjectData method", () => {
    it("should fallback to parent implementation for non-UUID data", () => {
      foundry.utils.parseUuid.mockReturnValue(null);

      const standardData = {
        item1: { name: "Sword", type: "weapon" },
      };

      const result = processor.normalizeObjectData(standardData);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Sword");
      expect(result[0].objectLoopKey).toBe("Item1");
    });

    it("should dereference a single valid UUID and call toObject()", () => {
      foundry.utils.parseUuid.mockReturnValue({ collection: "Actor" });

      const mockDocument = {
        name: "Goblin",
        toObject: jest.fn().mockReturnValue({ name: "Goblin Data", hp: 10 }),
      };
      global.fromUuidSync = jest.fn().mockReturnValue(mockDocument);

      const result = processor.normalizeObjectData("Actor.123");

      expect(global.fromUuidSync).toHaveBeenCalledWith("Actor.123");
      expect(mockDocument.toObject).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: "Goblin Data", hp: 10 });
    });

    it("should dereference an array of UUIDs", () => {
      foundry.utils.parseUuid.mockReturnValue({ collection: "Item" });

      const mockDoc1 = { toObject: () => ({ name: "Sword" }) };
      const mockDoc2 = { toObject: () => ({ name: "Shield" }) };

      global.fromUuidSync = jest.fn().mockReturnValueOnce(mockDoc1).mockReturnValueOnce(mockDoc2);

      const result = processor.normalizeObjectData(["Item.1", "Item.2"]);

      expect(global.fromUuidSync).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Sword");
      expect(result[1].name).toBe("Shield");
    });

    it("should handle documents that do not have a toObject method", () => {
      foundry.utils.parseUuid.mockReturnValue({ collection: "Actor" });

      const mockDocument = { name: "Raw Object Data" };
      global.fromUuidSync = jest.fn().mockReturnValue(mockDocument);

      const result = processor.normalizeObjectData("Actor.123");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: "Raw Object Data" });
    });

    it("should ignore UUIDs that cannot be found", () => {
      foundry.utils.parseUuid.mockReturnValue({ collection: "Item" });

      global.fromUuidSync = jest.fn().mockReturnValue(null);

      const result = processor.normalizeObjectData("Item.Missing");

      expect(global.fromUuidSync).toHaveBeenCalledWith("Item.Missing");
      expect(result).toHaveLength(0);
    });

    it("should catch errors thrown by fromUuidSync, log a warning, and return any successfully dereferenced objects", () => {
      foundry.utils.parseUuid.mockReturnValue({ collection: "Scene" });

      const mockDoc1 = { toObject: () => ({ name: "Sword" }) };
      const testError = new Error("Database error");
      global.fromUuidSync = jest
        .fn()
        .mockImplementationOnce(() => {
          throw testError;
        })
        .mockReturnValue(mockDoc1);

      const result = processor.normalizeObjectData(["Scene.Corrupted", "Scene.Valid"]);

      expect(result).toHaveLength(1);
      expect(consoleMocks.warnSpy).toHaveBeenCalledWith("Failed to dereference UUID: Scene.Corrupted", testError);
    });
  });
});
