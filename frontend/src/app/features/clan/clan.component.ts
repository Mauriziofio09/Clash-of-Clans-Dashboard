import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DashboardStore } from '../../core/services/dashboard-store.service';
import { ErrorPanelComponent } from '../../shared/components/error-panel.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { WarStatusComponent } from '../../shared/components/war-status.component';
import { formatNumber } from '../../core/services/format';

const ROLE_LABELS: Record<string, string> = {
  leader: 'Anführer',
  coLeader: 'Vize-Anführer',
  admin: 'Ältester',
  member: 'Mitglied',
};

/** Clan-Profil, Mitgliederliste und ausführlicher Kriegsstatus. */
@Component({
  selector: 'app-clan',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    MatTooltipModule,
    ErrorPanelComponent,
    SkeletonComponent,
    WarStatusComponent,
  ],
  templateUrl: './clan.component.html',
  styleUrl: './clan.component.scss',
})
export class ClanComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly clan = this.store.clan;
  protected readonly war = this.store.war;

  protected num(value: number): string {
    return formatNumber(value);
  }

  protected roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
  }

  protected retry(): void {
    this.store.forceRefresh();
  }
}
