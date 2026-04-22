import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SectionHead } from './SectionHead';

describe('SectionHead', () => {
  it('renders the title', () => {
    render(<SectionHead title="Active rooms" />);
    expect(screen.getByText('Active rooms')).toBeInTheDocument();
  });

  it('omits the view-all link when neither href nor handler is given', () => {
    render(<SectionHead title="Active rooms" />);
    expect(screen.queryByText('View all')).not.toBeInTheDocument();
  });

  it('fires onViewAll when the link is clicked', () => {
    const onViewAll = vi.fn();
    render(<SectionHead title="Active rooms" onViewAll={onViewAll} />);
    fireEvent.click(screen.getByText('View all'));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('uses a custom viewAllLabel', () => {
    render(<SectionHead title="Active rooms" onViewAll={() => {}} viewAllLabel="查看全部" />);
    expect(screen.getByText('查看全部')).toBeInTheDocument();
  });
});
