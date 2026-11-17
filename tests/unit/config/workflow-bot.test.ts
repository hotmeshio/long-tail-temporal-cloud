const longTail = vi.hoisted(() => ({
  listBots: vi.fn(),
  addBotRole: vi.fn(),
  createBot: vi.fn(),
  createClient: vi.fn((options: unknown) => ({ options })),
}));
vi.mock('@hotmeshio/long-tail', () => ({
  api: { botAccounts: { listBots: longTail.listBots, addBotRole: longTail.addBotRole, createBot: longTail.createBot } },
  createClient: longTail.createClient,
}));

import { WORKFLOW_BOT, workflowConnection } from '../../../src/config/workflow-bot';
import { BOT, ROLE, ROLE_TYPE } from '../../../src/modules/constants';

const BOT_ROLE = { role: ROLE.PRODUCTION, type: ROLE_TYPE.MEMBER };
const existing = { id: 'bot-7', external_id: BOT.WORKFLOWS };

beforeEach(() => {
  vi.clearAllMocks();
  longTail.addBotRole.mockResolvedValue({ status: 201 });
  longTail.createBot.mockResolvedValue({ status: 201, data: { id: 'bot-new', external_id: BOT.WORKFLOWS } });
});

describe('WORKFLOW_BOT', () => {
  it('is a member of every role an order waits in', () => {
    expect(WORKFLOW_BOT.name).toBe(BOT.WORKFLOWS);
    expect(WORKFLOW_BOT.roles).toEqual(Object.values(ROLE).map((role) => ({ role, type: ROLE_TYPE.MEMBER })));
  });
});

describe('workflowConnection', () => {
  it('searches for the workflow bot by name', async () => {
    longTail.listBots.mockResolvedValue({ status: 200, data: { bots: [existing] } });
    await workflowConnection();
    expect(longTail.listBots).toHaveBeenCalledWith({ search: BOT.WORKFLOWS, limit: 50 });
  });

  it('reuses the bot it finds, makes sure of its roles and connects as it', async () => {
    longTail.listBots.mockResolvedValue({ status: 200, data: { bots: [{ id: 'bot-1', external_id: 'another-bot' }, existing] } });
    const connection = await workflowConnection();
    expect(longTail.addBotRole).toHaveBeenCalledTimes(WORKFLOW_BOT.roles.length);
    expect(longTail.addBotRole).toHaveBeenCalledWith({ id: existing.id, ...BOT_ROLE });
    expect(longTail.createBot).not.toHaveBeenCalled();
    expect(longTail.createClient).toHaveBeenCalledWith({ auth: { userId: existing.id } });
    expect(connection).toEqual({ client: longTail.createClient.mock.results[0].value });
  });

  it('accepts a bare array of bots', async () => {
    longTail.listBots.mockResolvedValue({ status: 200, data: [existing] });
    await workflowConnection();
    expect(longTail.createClient).toHaveBeenCalledWith({ auth: { userId: existing.id } });
  });

  it('creates the bot when the search finds only near matches', async () => {
    longTail.listBots.mockResolvedValue({ status: 200, data: { bots: [{ id: 'bot-1', external_id: `${BOT.WORKFLOWS}-old` }] } });
    await workflowConnection();
    expect(longTail.createBot).toHaveBeenCalledWith(WORKFLOW_BOT);
    expect(longTail.addBotRole).not.toHaveBeenCalled();
    expect(longTail.createClient).toHaveBeenCalledWith({ auth: { userId: 'bot-new' } });
  });

  it('throws when the bots cannot be listed', async () => {
    longTail.listBots.mockResolvedValue({ status: 500, error: 'database is down' });
    await expect(workflowConnection()).rejects.toThrow('list bots: database is down');
    expect(longTail.createClient).not.toHaveBeenCalled();
  });

  it('throws when the role cannot be added', async () => {
    longTail.listBots.mockResolvedValue({ status: 200, data: [existing] });
    longTail.addBotRole.mockResolvedValue({ status: 500, error: 'database is down' });
    await expect(workflowConnection()).rejects.toThrow('add bot role: database is down');
    expect(longTail.createClient).not.toHaveBeenCalled();
  });

  it('throws when the bot cannot be created, with the status when no error is given', async () => {
    longTail.listBots.mockResolvedValue({ status: 200, data: [] });
    longTail.createBot.mockResolvedValue({ status: 403 });
    await expect(workflowConnection()).rejects.toThrow('create bot: 403');
  });
});
