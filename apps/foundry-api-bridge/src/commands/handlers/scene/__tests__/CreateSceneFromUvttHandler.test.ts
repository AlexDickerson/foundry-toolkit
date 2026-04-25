import { createSceneFromUvttHandler } from '@/commands/handlers/scene/CreateSceneFromUvttHandler';

// ---------------------------------------------------------------------------
// Minimal mock of the Foundry globals used by the handler
// ---------------------------------------------------------------------------

interface MockCreatedScene {
  id: string;
  name: string;
  img: string;
  width: number;
  height: number;
  active: boolean;
  grid: { size: number };
  update: jest.Mock;
  createEmbeddedDocuments: jest.Mock;
}

const mockScene: MockCreatedScene = {
  id: 'scene-abc',
  name: 'Test Map',
  img: 'maps/test.jpg',
  width: 2000,
  height: 1500,
  active: false,
  grid: { size: 100 },
  update: jest.fn().mockResolvedValue(undefined),
  createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
};

const mockGame = {
  scenes: {
    documentClass: {
      create: jest.fn().mockResolvedValue(mockScene),
    },
  },
};

// Foundry CONST values used to set wall sense/move types
const mockCONST: Record<string, Record<string, number>> = {
  WALL_MOVEMENT_TYPES: { NORMAL: 20 },
  WALL_SENSE_TYPES: { NORMAL: 20 },
  WALL_DOOR_TYPES: { DOOR: 1 },
};

(global as Record<string, unknown>)['game'] = mockGame;
(global as Record<string, unknown>)['CONST'] = mockCONST;

// ---------------------------------------------------------------------------
// Shared UVTT fixture
// ---------------------------------------------------------------------------

const baseUvtt = {
  resolution: {
    pixels_per_grid: 100,
    map_size: { x: 20, y: 15 },
  },
  line_of_sight: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSceneFromUvttHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScene.update.mockResolvedValue(undefined);
    mockScene.createEmbeddedDocuments.mockResolvedValue([]);
    mockGame.scenes.documentClass.create.mockResolvedValue(mockScene);
  });

  // Regression: background image was being passed as `levels[0].background.src`
  // (the third-party Levels module schema) instead of the vanilla Foundry
  // `background.src` field. Scenes created via the "Create scene" button in the
  // dm-tool map browser appeared with no background image.
  it('puts the background image on background.src, not in a levels array', async () => {
    await createSceneFromUvttHandler({
      name: 'My Map',
      img: 'maps/dungeon.jpg',
      uvtt: baseUvtt,
    });

    expect(mockGame.scenes.documentClass.create).toHaveBeenCalledTimes(1);
    const sceneData = mockGame.scenes.documentClass.create.mock.calls[0][0] as Record<string, unknown>;

    // Must carry background.src
    expect(sceneData['background']).toEqual({ src: 'maps/dungeon.jpg' });

    // Must NOT carry a levels array (that was the wrong fix)
    expect(sceneData['levels']).toBeUndefined();
  });

  it('omits background entirely when img is not provided', async () => {
    await createSceneFromUvttHandler({
      name: 'No Image',
      uvtt: baseUvtt,
    });

    const sceneData = mockGame.scenes.documentClass.create.mock.calls[0][0] as Record<string, unknown>;

    expect(sceneData['background']).toBeUndefined();
    expect(sceneData['levels']).toBeUndefined();
  });

  it('derives scene dimensions from uvtt resolution', async () => {
    await createSceneFromUvttHandler({
      name: 'Sized Map',
      uvtt: {
        resolution: { pixels_per_grid: 50, map_size: { x: 30, y: 20 } },
        line_of_sight: [],
      },
    });

    const sceneData = mockGame.scenes.documentClass.create.mock.calls[0][0] as Record<string, unknown>;

    // 30 grid cells × 50 px/cell = 1500 px wide; 20 × 50 = 1000 px tall
    expect(sceneData['width']).toBe(1500);
    expect(sceneData['height']).toBe(1000);
  });

  it('activates the scene when activate=true', async () => {
    await createSceneFromUvttHandler({
      name: 'Active Map',
      uvtt: baseUvtt,
      activate: true,
    });

    expect(mockScene.update).toHaveBeenCalledWith({ active: true });
  });

  it('does not activate the scene when activate is omitted', async () => {
    await createSceneFromUvttHandler({
      name: 'Inactive Map',
      uvtt: baseUvtt,
    });

    expect(mockScene.update).not.toHaveBeenCalled();
  });

  it('creates walls from line_of_sight segments', async () => {
    mockScene.createEmbeddedDocuments.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);

    const result = await createSceneFromUvttHandler({
      name: 'Walled Map',
      uvtt: {
        resolution: { pixels_per_grid: 100, map_size: { x: 10, y: 10 } },
        line_of_sight: [
          [
            { x: 1, y: 1 },
            { x: 3, y: 1 },
          ],
          [
            { x: 3, y: 1 },
            { x: 3, y: 3 },
          ],
        ],
      },
    });

    expect(mockScene.createEmbeddedDocuments).toHaveBeenCalledWith('Wall', expect.any(Array));
    // 2 wall segments, no doors → wallsCreated=2, doorsCreated=0
    expect(result.wallsCreated).toBe(2);
    expect(result.doorsCreated).toBe(0);
  });

  it('converts portals to door walls', async () => {
    // 1 wall + 1 door; createEmbeddedDocuments receives both
    mockScene.createEmbeddedDocuments.mockResolvedValue([{ id: 'w1' }, { id: 'd1' }]);

    const result = await createSceneFromUvttHandler({
      name: 'Door Map',
      uvtt: {
        resolution: { pixels_per_grid: 100, map_size: { x: 10, y: 10 } },
        line_of_sight: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]],
        portals: [
          {
            position: { x: 2, y: 0 },
            bounds: [
              { x: 2, y: 0 },
              { x: 3, y: 0 },
            ],
            closed: false,
          },
        ],
      },
    });

    expect(result.wallsCreated).toBe(1);
    expect(result.doorsCreated).toBe(1);
  });

  it('returns correct scene metadata', async () => {
    const result = await createSceneFromUvttHandler({
      name: 'Meta Map',
      img: 'maps/meta.png',
      uvtt: baseUvtt,
    });

    expect(result.id).toBe('scene-abc');
    expect(result.name).toBe('Test Map');
    expect(result.img).toBe('maps/test.jpg');
    expect(result.width).toBe(2000);
    expect(result.height).toBe(1500);
    expect(result.gridSize).toBe(100);
    expect(result.gridCols).toBe(20);
    expect(result.gridRows).toBe(15);
  });
});
