/**
 * Tests for PermissionEditor Component
 *
 * Tests the warning dialog that appears when granting write permissions
 * to multi-member WhatsApp groups.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PermissionEditor from '../PermissionEditor';
import type { ChatWithPermission, StoredGroup } from '../../api';

// Mock the API module
vi.mock('../../api', () => ({
  getGroup: vi.fn(),
}));

import { getGroup } from '../../api';

const mockGetGroup = getGroup as ReturnType<typeof vi.fn>;

describe('PermissionEditor', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  const baseIndividualChat: ChatWithPermission = {
    chatId: '1234567890@s.whatsapp.net',
    chatType: 'individual',
    permission: 'read_only',
  };

  const baseGroupChat: ChatWithPermission = {
    chatId: '120363123456789012@g.us',
    chatType: 'group',
    permission: 'read_only',
  };

  const multiMemberGroup: StoredGroup = {
    group_id: '120363123456789012@g.us',
    group_name: 'Test Group',
    group_subject: 'Test Group Subject',
    participant_count: 5,
    last_updated: new Date().toISOString(),
  };

  const soloGroup: StoredGroup = {
    group_id: '120363123456789012@g.us',
    group_name: 'Solo Group',
    group_subject: 'Solo Group Subject',
    participant_count: 1,
    last_updated: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
  });

  describe('Individual chats', () => {
    it('should not show warning dialog for individual chats', async () => {
      mockGetGroup.mockResolvedValue(null);

      render(
        <PermissionEditor chat={baseIndividualChat} onClose={mockOnClose} onSave={mockOnSave} />
      );

      // Click on Read + Write option
      const readWriteOption = screen.getByText('Read + Write');
      fireEvent.click(readWriteOption);

      // Warning dialog should NOT appear
      expect(screen.queryByText('Warning: Multi-Member Group')).not.toBeInTheDocument();
    });

    it('should not fetch group info for individual chats', () => {
      mockGetGroup.mockResolvedValue(null);

      render(
        <PermissionEditor chat={baseIndividualChat} onClose={mockOnClose} onSave={mockOnSave} />
      );

      // getGroup should not be called for individual chats
      expect(mockGetGroup).not.toHaveBeenCalled();
    });
  });

  describe('Solo groups (1 member)', () => {
    it('should not show warning dialog for solo groups', async () => {
      mockGetGroup.mockResolvedValue(soloGroup);

      render(<PermissionEditor chat={baseGroupChat} onClose={mockOnClose} onSave={mockOnSave} />);

      // Wait for group info to be fetched
      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalledWith(baseGroupChat.chatId);
      });

      // Click on Read + Write option
      const readWriteOption = screen.getByText('Read + Write');
      fireEvent.click(readWriteOption);

      // Warning dialog should NOT appear for solo group
      expect(screen.queryByText('Warning: Multi-Member Group')).not.toBeInTheDocument();
    });
  });

  describe('Multi-member groups', () => {
    it('should show warning dialog when selecting read_write for multi-member group', async () => {
      mockGetGroup.mockResolvedValue(multiMemberGroup);

      render(<PermissionEditor chat={baseGroupChat} onClose={mockOnClose} onSave={mockOnSave} />);

      // Wait for group info to be fetched
      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalledWith(baseGroupChat.chatId);
      });

      // Click on Read + Write option
      const readWriteOption = screen.getByText('Read + Write');
      fireEvent.click(readWriteOption);

      // Warning dialog should appear
      expect(screen.getByText('Warning: Multi-Member Group')).toBeInTheDocument();
      expect(screen.getByText('This group has 5 members.')).toBeInTheDocument();
    });

    it('should display warning message about responding to anyone', async () => {
      mockGetGroup.mockResolvedValue(multiMemberGroup);

      render(<PermissionEditor chat={baseGroupChat} onClose={mockOnClose} onSave={mockOnSave} />);

      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalled();
      });

      // Click on Read + Write option
      fireEvent.click(screen.getByText('Read + Write'));

      // Check for warning message content
      expect(screen.getByText(/Orient will respond to/)).toBeInTheDocument();
      expect(screen.getByText(/anyone/)).toBeInTheDocument();
    });

    it('should cancel warning and not change permission', async () => {
      mockGetGroup.mockResolvedValue(multiMemberGroup);

      render(<PermissionEditor chat={baseGroupChat} onClose={mockOnClose} onSave={mockOnSave} />);

      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalled();
      });

      // Click on Read + Write option
      fireEvent.click(screen.getByText('Read + Write'));

      // Warning dialog should appear
      expect(screen.getByText('Warning: Multi-Member Group')).toBeInTheDocument();

      // Click Cancel
      const cancelButtons = screen.getAllByText('Cancel');
      // The warning dialog's cancel button is the last one
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);

      // Warning dialog should close
      await waitFor(() => {
        expect(screen.queryByText('Warning: Multi-Member Group')).not.toBeInTheDocument();
      });

      // Permission should still be read_only (not changed to read_write)
      // Use getAllByText and find the one in a label (not the badge)
      const readOnlyLabels = screen.getAllByText('Read Only');
      const readOnlyOption = readOnlyLabels
        .map((el) => el.closest('label'))
        .find((label) => label !== null);
      expect(readOnlyOption).toHaveClass('border-primary');
    });

    it('should confirm warning and change permission to read_write', async () => {
      mockGetGroup.mockResolvedValue(multiMemberGroup);

      render(<PermissionEditor chat={baseGroupChat} onClose={mockOnClose} onSave={mockOnSave} />);

      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalled();
      });

      // Click on Read + Write option
      fireEvent.click(screen.getByText('Read + Write'));

      // Warning dialog should appear
      expect(screen.getByText('Warning: Multi-Member Group')).toBeInTheDocument();

      // Click confirm button
      fireEvent.click(screen.getByText('I Understand, Enable Write Access'));

      // Warning dialog should close
      await waitFor(() => {
        expect(screen.queryByText('Warning: Multi-Member Group')).not.toBeInTheDocument();
      });

      // Permission should now be read_write
      const readWriteOption = screen.getByText('Read + Write').closest('label');
      expect(readWriteOption).toHaveClass('border-primary');
    });

    it('should not show warning when switching back to read_write after being read_write originally', async () => {
      const groupWithReadWrite: ChatWithPermission = {
        ...baseGroupChat,
        permission: 'read_write',
      };
      mockGetGroup.mockResolvedValue(multiMemberGroup);

      render(
        <PermissionEditor chat={groupWithReadWrite} onClose={mockOnClose} onSave={mockOnSave} />
      );

      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalled();
      });

      // Click on Read Only first - use getAllByText to avoid multiple match error
      const readOnlyLabels = screen.getAllByText('Read Only');
      const readOnlyOption = readOnlyLabels
        .map((el) => el.closest('label'))
        .find((label) => label !== null);
      if (readOnlyOption) {
        fireEvent.click(readOnlyOption);
      }

      // Now click Read + Write - since original permission was read_write, no warning needed
      // The condition chat.permission !== 'read_write' is false, so no warning
      const readWriteLabels = screen.getAllByText('Read + Write');
      const readWriteOption = readWriteLabels
        .map((el) => el.closest('label'))
        .find((label) => label !== null);
      if (readWriteOption) {
        fireEvent.click(readWriteOption);
      }

      // Warning should NOT appear because original permission was read_write
      expect(screen.queryByText('Warning: Multi-Member Group')).not.toBeInTheDocument();
    });
  });

  describe('Unknown participant count (null)', () => {
    it('should show warning when participant_count is null (treat as multi-member)', async () => {
      const groupWithNullCount: StoredGroup = {
        ...multiMemberGroup,
        participant_count: null,
      };
      mockGetGroup.mockResolvedValue(groupWithNullCount);

      render(<PermissionEditor chat={baseGroupChat} onClose={mockOnClose} onSave={mockOnSave} />);

      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalled();
      });

      // Click on Read + Write option
      fireEvent.click(screen.getByText('Read + Write'));

      // Warning dialog should appear with generic message
      expect(screen.getByText('Warning: Multi-Member Group')).toBeInTheDocument();
      expect(screen.getByText('This group has multiple members.')).toBeInTheDocument();
    });

    it('should show warning when group is not found (getGroup returns null)', async () => {
      mockGetGroup.mockResolvedValue(null);

      render(<PermissionEditor chat={baseGroupChat} onClose={mockOnClose} onSave={mockOnSave} />);

      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalled();
      });

      // Click on Read + Write option
      fireEvent.click(screen.getByText('Read + Write'));

      // Warning dialog should appear (treat unknown as potentially multi-member)
      expect(screen.getByText('Warning: Multi-Member Group')).toBeInTheDocument();
    });
  });

  describe('Group info fetching', () => {
    it('should fetch group info on mount for group chats', async () => {
      mockGetGroup.mockResolvedValue(multiMemberGroup);

      render(<PermissionEditor chat={baseGroupChat} onClose={mockOnClose} onSave={mockOnSave} />);

      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalledWith(baseGroupChat.chatId);
      });
    });

    it('should handle getGroup returning null gracefully', async () => {
      // getGroup returns null when there's an error or group not found
      // (errors are caught in the API function itself)
      mockGetGroup.mockResolvedValue(null);

      render(<PermissionEditor chat={baseGroupChat} onClose={mockOnClose} onSave={mockOnSave} />);

      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalled();
      });

      // Click on Read + Write option (should still work)
      fireEvent.click(screen.getByText('Read + Write'));

      // Warning should appear (treat null/unknown as potentially multi-member)
      expect(screen.getByText('Warning: Multi-Member Group')).toBeInTheDocument();
    });
  });

  describe('Form submission', () => {
    it('should save permission after confirming warning', async () => {
      mockGetGroup.mockResolvedValue(multiMemberGroup);

      render(<PermissionEditor chat={baseGroupChat} onClose={mockOnClose} onSave={mockOnSave} />);

      await waitFor(() => {
        expect(mockGetGroup).toHaveBeenCalled();
      });

      // Click on Read + Write option
      fireEvent.click(screen.getByText('Read + Write'));

      // Confirm the warning
      fireEvent.click(screen.getByText('I Understand, Enable Write Access'));

      // Submit the form
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith('read_write', undefined, undefined);
      });
    });
  });
});
