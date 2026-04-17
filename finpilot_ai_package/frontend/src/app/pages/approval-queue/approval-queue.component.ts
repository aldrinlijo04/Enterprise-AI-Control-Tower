import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ApprovalItem } from '../../models';

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './approval-queue.component.html',
  styleUrl: './approval-queue.component.css'
})
export class ApprovalQueueComponent implements OnInit {
  private api = inject(ApiService);

  items = signal<ApprovalItem[]>([]);
  actor = 'Controller';
  comment = '';

  showPopup = false;
  popupAction: 'approve' | 'reject' | 'escalate' | '' = '';
  selectedItem: ApprovalItem | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.getApprovals('pending').subscribe({
      next: (res) => this.items.set(res.items || []),
      error: () => this.items.set([])
    });
  }

  act(id: string, action: 'approve' | 'reject' | 'escalate'): void {
    this.api.actOnApproval({
      approval_id: id,
      action,
      actor: this.actor,
      comment: this.comment
    }).subscribe({
      next: () => {
        this.items.update(list => list.filter(item => item.approval_id !== id));
      },
      error: (err) => {
        console.error(err);
      }
    });
  }

  openPopup(item: ApprovalItem, action: 'approve' | 'reject' | 'escalate'): void {
    this.selectedItem = item;
    this.popupAction = action;
    this.showPopup = true;
  }

  closePopup(): void {
    this.showPopup = false;
    this.popupAction = '';
    this.selectedItem = null;
  }

  confirmAction(): void {
    if (!this.selectedItem || !this.popupAction) return;

    const currentItem = this.selectedItem;
    const action = this.popupAction;

    this.api.actOnApproval({
      approval_id: currentItem.approval_id,
      action,
      actor: this.actor,
      comment: this.comment
    }).subscribe({
      next: () => {
        this.items.update(list =>
          list.filter(item => item.approval_id !== currentItem.approval_id)
        );

        this.closePopup();
      },
      error: (err) => {
        console.error(err);
        this.closePopup();
      }
    });
  }
}