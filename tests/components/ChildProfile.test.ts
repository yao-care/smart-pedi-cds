import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ChildProfile from '../../src/components/assess/ChildProfile.svelte';

describe('ChildProfile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00Z'));
  });

  it('renders the form heading and required fields', () => {
    render(ChildProfile);
    expect(screen.getByRole('heading', { name: '兒童基本資料' })).toBeInTheDocument();
    expect(screen.getByLabelText(/出生日期/)).toBeInTheDocument();
    expect(screen.getByText(/性別/)).toBeInTheDocument();
  });

  it('renders all three gender options', () => {
    render(ChildProfile);
    expect(screen.getByLabelText(/^男$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^女$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^其他$/)).toBeInTheDocument();
  });

  it('shows age badge when valid birth date is entered', async () => {
    render(ChildProfile);
    const dateInput = screen.getByLabelText(/出生日期/) as HTMLInputElement;
    await fireEvent.input(dateInput, { target: { value: '2024-05-14' } });
    // 24 months old → toddler
    expect(await screen.findByText(/24 個月/)).toBeInTheDocument();
  });

  it('shows age warning when birth date is out of range', async () => {
    render(ChildProfile);
    const dateInput = screen.getByLabelText(/出生日期/) as HTMLInputElement;
    await fireEvent.input(dateInput, { target: { value: '2015-01-01' } });
    expect(await screen.findByText(/超出適用年齡範圍/)).toBeInTheDocument();
  });

  it('does not show age badge when birth date is empty', () => {
    render(ChildProfile);
    expect(screen.queryByText(/個月 —/)).not.toBeInTheDocument();
  });
});
