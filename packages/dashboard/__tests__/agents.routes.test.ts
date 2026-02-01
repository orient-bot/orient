/**
 * Tests for Agents Routes
 *
 * Tests for the agent registry API endpoints, including skill and tool management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Use vi.hoisted to ensure mock values are available for hoisted vi.mock calls
const { mockDb, mockAgentSkills, mockAgentTools } = vi.hoisted(() => {
  const mockAgentSkills = [
    { id: 1, agentId: 'test-agent', skillName: 'test-skill-1', enabled: true },
    { id: 2, agentId: 'test-agent', skillName: 'test-skill-2', enabled: true },
    { id: 3, agentId: 'test-agent', skillName: 'disabled-skill', enabled: false },
  ];

  const mockAgentTools = [
    { id: 1, agentId: 'test-agent', pattern: 'allow-*', type: 'allow' },
    { id: 2, agentId: 'test-agent', pattern: 'deny-*', type: 'deny' },
    { id: 3, agentId: 'test-agent', pattern: 'ask-*', type: 'ask' },
  ];

  return {
    mockDb: {
      select: vi.fn().mockReturnThis(),
      selectDistinct: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    },
    mockAgentSkills,
    mockAgentTools,
  };
});

// Mock core
vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock database
vi.mock('@orient-bot/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orient-bot/database')>();
  return {
    ...actual,
    getDatabase: () => mockDb,
  };
});

import { createAgentsRoutes } from '../src/server/routes/agents.routes.js';

describe('Agents Routes', () => {
  let router: ReturnType<typeof createAgentsRoutes>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  const mockRequireAuth = vi.fn((_req, _res, next) => next());

  beforeEach(() => {
    vi.clearAllMocks();
    router = createAgentsRoutes(mockRequireAuth as any);

    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
  });

  describe('GET /:id - Agent details with skills', () => {
    it('should return skills with id, skillName, and enabled fields', async () => {
      const mockAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        enabled: true,
      };

      // Setup mock chain for agent query
      mockDb.orderBy.mockResolvedValueOnce([mockAgent]); // for agents list (not used here)
      mockDb.where
        .mockResolvedValueOnce([mockAgent]) // for agent lookup
        .mockResolvedValueOnce(mockAgentSkills) // for skills
        .mockResolvedValueOnce(mockAgentTools); // for tools

      mockReq = {
        params: { id: 'test-agent' },
      };

      // Find the route handler
      const route = router.stack.find(
        (layer) => layer.route?.path === '/:id' && layer.route?.methods?.get
      );
      expect(route).toBeDefined();

      // Execute the route handler
      const handler = route!.route!.stack[1].handle; // [0] is requireAuth, [1] is actual handler
      await handler(mockReq as Request, mockRes as Response);

      // Verify response
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-agent',
          name: 'Test Agent',
          skills: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(Number),
              skillName: expect.any(String),
              enabled: expect.any(Boolean),
            }),
          ]),
        })
      );

      // Verify skill schema - should have skillName, NOT name
      const response = (mockRes.json as vi.Mock).mock.calls[0][0];
      expect(response.skills[0]).toHaveProperty('skillName');
      expect(response.skills[0]).toHaveProperty('id');
      expect(response.skills[0]).toHaveProperty('enabled');
      expect(response.skills[0]).not.toHaveProperty('name'); // Should NOT have 'name' field
    });
  });

  describe('GET /:id/skills - Agent skills endpoint', () => {
    it('should return skills with id, skillName, and enabled fields', async () => {
      mockDb.where.mockResolvedValueOnce(mockAgentSkills);

      mockReq = {
        params: { id: 'test-agent' },
      };

      // Find the skills route handler
      const route = router.stack.find(
        (layer) => layer.route?.path === '/:id/skills' && layer.route?.methods?.get
      );
      expect(route).toBeDefined();

      // Execute the route handler
      const handler = route!.route!.stack[1].handle;
      await handler(mockReq as Request, mockRes as Response);

      // Verify response schema
      expect(mockRes.json).toHaveBeenCalledWith({
        skills: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(Number),
            skillName: expect.any(String),
            enabled: expect.any(Boolean),
          }),
        ]),
      });

      // Verify skill schema consistency
      const response = (mockRes.json as vi.Mock).mock.calls[0][0];
      response.skills.forEach((skill: Record<string, unknown>) => {
        expect(skill).toHaveProperty('skillName');
        expect(skill).toHaveProperty('id');
        expect(skill).toHaveProperty('enabled');
        expect(skill).not.toHaveProperty('name'); // Schema consistency: skillName not name
      });
    });
  });

  describe('PUT /:id/skills - Update agent skills', () => {
    it('should return updated skills with consistent schema', async () => {
      const updatedSkills = [
        { id: 10, agentId: 'test-agent', skillName: 'new-skill', enabled: true },
      ];

      // Mock the delete operation (returns the mock itself for chaining)
      mockDb.where.mockResolvedValueOnce(undefined); // delete where
      // Mock the select after insert
      mockDb.where.mockResolvedValueOnce(updatedSkills);

      mockReq = {
        params: { id: 'test-agent' },
        body: { skills: ['new-skill'] },
      };

      // Find the PUT skills route handler
      const route = router.stack.find(
        (layer) => layer.route?.path === '/:id/skills' && layer.route?.methods?.put
      );
      expect(route).toBeDefined();

      // Execute the route handler
      const handler = route!.route!.stack[1].handle;
      await handler(mockReq as Request, mockRes as Response);

      // Verify response was called
      expect(mockRes.json).toHaveBeenCalled();

      // Verify response schema matches GET endpoint
      const response = (mockRes.json as vi.Mock).mock.calls[0][0];
      expect(response.skills).toBeInstanceOf(Array);
      expect(response.skills.length).toBeGreaterThan(0);
      expect(response.skills[0]).toHaveProperty('skillName');
      expect(response.skills[0]).toHaveProperty('id');
      expect(response.skills[0]).toHaveProperty('enabled');
      expect(response.skills[0]).not.toHaveProperty('name');
    });
  });
});
