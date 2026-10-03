import { Component, Input, HostListener, ElementRef, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { NgStyle } from '@angular/common';
import { RowMenuService } from './row-menu.service';

export interface RowAction {
  label: string;
  icon?: 'edit' | 'view' | 'toggle-on' | 'toggle-off' | 'ban' | 'trash' | 'print' | 'key' | 'anular' | 'refresh' | 'bitacora' | 'shield' | 'receipt' | 'seguimiento' | 'mail' | 'plus';
  variant?: 'default' | 'danger' | 'warning';
  disabled?: boolean;
  tooltip?: string;
  action: () => void;
}

@Component({
  selector: 'app-row-menu',
  standalone: true,
  imports: [NgStyle],
  templateUrl: './row-menu.html',
  styleUrl: './row-menu.scss',
})
export class RowMenuComponent implements OnDestroy {
  @Input() actions: RowAction[] = [];
  @ViewChild('dropdownEl') dropdownEl?: ElementRef<HTMLElement>;

  open = false;
  dropdownStyle: { top: string; left: string } = { top: '0', left: '0' };

  private scrollHandler = () => { this.close(); };

  constructor(private el: ElementRef, private cdr: ChangeDetectorRef, private rowMenuSvc: RowMenuService) {}

  ngOnDestroy() {
    this.removeScrollListener();
    this.rowMenuSvc.closed(this);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent) {
    if (!this.el.nativeElement.contains(e.target)) this.close();
  }

  toggle(e: MouseEvent) {
    e.stopPropagation();
    if (this.open) {
      this.close();
      return;
    }
    this.rowMenuSvc.open(this);
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const margin = 4;
    const dropdownWidth = 182;
    this.dropdownStyle = {
      top: `${rect.bottom + margin}px`,
      left: `${rect.left + dropdownWidth > window.innerWidth ? Math.max(margin, rect.right - dropdownWidth) : rect.left}px`,
    };
    this.open = true;
    this.addScrollListener();
    // Render first with an estimate, then re-measure against the real dropdown
    // size (which depends on the number of actions) and flip above the button
    // or clamp horizontally if it would otherwise overflow the viewport.
    this.cdr.detectChanges();
    const dd = this.dropdownEl?.nativeElement;
    if (dd) {
      const w = dd.offsetWidth || dropdownWidth;
      const h = dd.offsetHeight;
      let left = rect.left + w > window.innerWidth ? Math.max(margin, rect.right - w) : rect.left;
      left = Math.max(margin, left);
      let top = rect.bottom + margin;
      if (top + h > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - h - margin);
      }
      this.dropdownStyle = { top: `${top}px`, left: `${left}px` };
    }
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.removeScrollListener();
    this.rowMenuSvc.closed(this);
  }

  run(e: MouseEvent, item: RowAction) {
    e.stopPropagation();
    if (item.disabled) return;
    this.close();
    item.action();
  }

  private addScrollListener() {
    window.addEventListener('scroll', this.scrollHandler, { capture: true, passive: true });
  }

  private removeScrollListener() {
    window.removeEventListener('scroll', this.scrollHandler, { capture: true } as any);
  }
}
