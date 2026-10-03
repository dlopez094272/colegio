import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-paginator',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (total > 0) {
      <div class="paginator">
        <span class="pag-info">{{ from }}–{{ to }} de {{ total }} registros</span>
        <div class="pag-btns">
          <button class="pag-btn" [disabled]="page <= 1" (click)="go(1)" title="Primera página">«</button>
          <button class="pag-btn" [disabled]="page <= 1" (click)="go(page - 1)" title="Página anterior">‹</button>
          @for (p of pages; track p) {
            <button
              class="pag-btn"
              [class.active]="p === page"
              [class.ellipsis]="p < 0"
              [disabled]="p < 0 || p === page"
              (click)="p > 0 && go(p)">
              {{ p < 0 ? '…' : p }}
            </button>
          }
          <button class="pag-btn" [disabled]="page >= totalPages" (click)="go(page + 1)" title="Página siguiente">›</button>
          <button class="pag-btn" [disabled]="page >= totalPages" (click)="go(totalPages)" title="Última página">»</button>
        </div>
        <select class="pag-size" [(ngModel)]="pageSizeModel" (ngModelChange)="onSizeChange($event)">
          <option [ngValue]="10">10 / pág</option>
          <option [ngValue]="25">25 / pág</option>
          <option [ngValue]="50">50 / pág</option>
          <option [ngValue]="100">100 / pág</option>
          <option [ngValue]="250">250 / pág</option>
          <option [ngValue]="500">500 / pág</option>
        </select>
      </div>
    }
  `,
  styleUrl: './paginator.scss',
})
export class PaginatorComponent implements OnChanges {
  @Input() total    = 0;
  @Input() page     = 1;
  @Input() pageSize = 25;
  @Output() pageChange     = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  totalPages   = 0;
  from         = 0;
  to           = 0;
  pages: number[] = [];
  pageSizeModel = 25;

  ngOnChanges() {
    this.pageSizeModel = this.pageSize;
    this.totalPages    = this.total > 0 ? Math.ceil(this.total / this.pageSize) : 0;
    this.from          = this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
    this.to            = Math.min(this.page * this.pageSize, this.total);
    this.buildPages();
  }

  buildPages() {
    const max = this.totalPages;
    const cur = this.page;
    const pages: number[] = [];
    if (max <= 7) {
      for (let i = 1; i <= max; i++) pages.push(i);
    } else {
      pages.push(1);
      if (cur > 3)       pages.push(-1);
      for (let i = Math.max(2, cur - 1); i <= Math.min(max - 1, cur + 1); i++) pages.push(i);
      if (cur < max - 2) pages.push(-1);
      pages.push(max);
    }
    this.pages = pages;
  }

  go(p: number) {
    if (p < 1 || p > this.totalPages || p === this.page) return;
    this.pageChange.emit(p);
  }

  onSizeChange(size: number) {
    this.pageSizeChange.emit(+size);
  }
}
