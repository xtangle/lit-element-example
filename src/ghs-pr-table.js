import '@vaadin/vaadin-button/vaadin-button';
import '@vaadin/vaadin-grid/vaadin-grid';
import '@vaadin/vaadin-grid/vaadin-grid-sort-column';
import '@vaadin/vaadin-icons/vaadin-icons';
import '@vaadin/vaadin-notification/vaadin-notification';
import '@vaadin/vaadin-progress-bar/vaadin-progress-bar';
import { differenceInBusinessDays, format, parseISO, startOfDay, subDays } from 'date-fns';
import { css, html, LitElement } from 'lit-element';
import { fetchPullRequestData } from './client';
import './ghs-notification';
import { FILENAME_TIMESTAMP_FMT, GITHUB_SEARCH_QUERY_TIMESTAMP_FMT, PR_STATUSES, YESNO } from './constants';
import { exportCsv, interpretErrorResponse } from './utils';

class GhsPrTable extends LitElement {
  static get properties() {
    return {
      api: { type: String },
      auth: { type: Object },
      data: { type: Array },
      metadata: { type: Object },
      loading: { type: Boolean },
      error: { type: String },
      searchQuery: { type: String },
    };
  }

  static get styles() {
    return css`
      .controls {
        display: flex;
        flex-direction: row;
        align-items: flex-end;
        padding-bottom: var(--lumo-space-m);
      }
      .controls > *:not(:last-child) {
        margin-right: var(--lumo-space-m);
      }
      .controls__search {
        padding-top: 0;
        flex-grow: 1;
      }
      .link__icon {
        margin-top: -4px;
        --iron-icon-width: 16px;
        --iron-icon-height: 16px;
        --iron-icon-fill-color: var(--lumo-primary-color);
      }
      .grid-footer {
        margin-top: var(--lumo-space-s);
        text-align: end;
      }
      vaadin-grid {
        height: calc(100vh - 17em);
        min-height: 25em;
      }
      vaadin-button {
        cursor: pointer;
      }
    `;
  }

  constructor() {
    super();
    this.data = [];
    this.metadata = {
      totalCount: 0,
    };
    this.loading = false;

    const endDate = new Date();
    const startDate = startOfDay(subDays(endDate, 14));
    this.searchQuery = `org:"GoogleChrome" created:${format(startDate, GITHUB_SEARCH_QUERY_TIMESTAMP_FMT)}..${format(endDate, GITHUB_SEARCH_QUERY_TIMESTAMP_FMT)}`;
  }

  get notification() {
    return this.shadowRoot.getElementById('ghs-pr-table-notification');
  }

  get grid() {
    return this.shadowRoot.querySelector('vaadin-grid');
  }

  get gridColumns() {
    return this.shadowRoot.querySelectorAll('vaadin-grid-column,vaadin-grid-sort-column');
  }

  async reload() {
    this.loading = true;
    return fetchPullRequestData(this.api, this.auth, this.searchQuery).then((response) => {
      console.debug(response);
      this.consumeResponse(response);
      this.updateComplete.then(() => this.grid.recalculateColumnWidths());
    }).catch((error) => {
      console.error(error);
      this.error = interpretErrorResponse(error);
      this.notification.open();
    }).finally(() => {
      this.loading = false;
    });
  }

  async download() {
    return exportCsv(`pull_requests_${format(new Date(), FILENAME_TIMESTAMP_FMT)}.csv`, this.grid);
  }

  consumeResponse(response) {
    this.data = response.search.nodes.map(pr => ({
      repository: pr.repository.name,
      title: pr.title,
      commits: pr.commits.totalCount,
      files: pr.files.totalCount,
      additions: pr.files.nodes.reduce((acc, v) => acc + v.additions, 0),
      deletions: pr.files.nodes.reduce((acc, v) => acc + v.deletions, 0),
      participants: pr.participants.totalCount,
      reviews: pr.reviews.totalCount,
      daysOpen: differenceInBusinessDays(pr.closed ? parseISO(pr.closedAt) : new Date(), parseISO(pr.createdAt)),
      merged: pr.merged ? YESNO.YES : YESNO.NO,
      status: pr.closed ? PR_STATUSES.CLOSED : PR_STATUSES.OPEN,
      link: pr.url,
    }));
    this.metadata = {
      totalCount: response.search.issueCount,
    };
  };

  searchInputChangeHandler(e) {
    this.searchQuery = e.path[0].value;
  }

  searchInputEnterHandler(e) {
    if (e.key === 'Enter') {
      this.reload();
    }
  }

  firstUpdated(changedProperties) {
    this.gridColumns[11].renderer = (root, column, rowData) => {
      root.innerHTML = `<a class="link" href="${rowData.item.link}" target="_blank"><iron-icon class="link__icon" icon="vaadin:external-link"></iron-icon></a>`;
    };
  }

  render() {
    return html`
      <h3>Pull Requests</h3>
      <div class="controls">
        <vaadin-text-field class="controls__search" label="Search Query" value="${this.searchQuery}" 
          @input="${this.searchInputChangeHandler}" @keydown="${this.searchInputEnterHandler}"></vaadin-text-field>
        <vaadin-button @click="${this.reload}" theme="icon" aria-label="Reload" title="Reload">
          <iron-icon icon="vaadin:refresh"></iron-icon>
        </vaadin-button>
        <vaadin-button @click="${this.download}" theme="icon" aria-label="Download table in CSV format" title="Download CSV" ?disabled="${!this.data.length}">
          <iron-icon icon="vaadin:download-alt"></iron-icon>
        </vaadin-button> 
      </div>
      <ghs-notification id="ghs-pr-table-notification" type="error" innerHTML="${this.error}"></ghs-notification>
      ${this.loading ? html`<vaadin-progress-bar indeterminate value="0"></vaadin-progress-bar>` : ''}
      <vaadin-grid .items="${this.data}" theme="compact row-dividers column-borders" column-reordering-allowed multi-sort>
        <vaadin-grid-sort-column path="repository" title="repository" header="Repository" auto-width resizable></vaadin-grid-sort-column>
        <vaadin-grid-sort-column path="title" header="Title" auto-width resizable></vaadin-grid-sort-column>
        <vaadin-grid-sort-column path="commits" header="Commits" text-align="end" width="7em" flex-grow="0" resizable></vaadin-grid-sort-column>
        <vaadin-grid-sort-column path="files" header="Files" text-align="end" width="7em" flex-grow="0" resizable></vaadin-grid-sort-column>
        <vaadin-grid-sort-column path="additions" header="Additions" text-align="end" width="7em" flex-grow="0" resizable></vaadin-grid-sort-column>
        <vaadin-grid-sort-column path="deletions" header="Deletions" text-align="end" width="7em" flex-grow="0" resizable></vaadin-grid-sort-column>
        <vaadin-grid-sort-column path="participants" header="Participants" text-align="end" width="7em" flex-grow="0" resizable></vaadin-grid-sort-column>
        <vaadin-grid-sort-column path="reviews" header="Reviews" text-align="end" width="7em" flex-grow="0" resizable></vaadin-grid-sort-column>
        <vaadin-grid-sort-column path="daysOpen" header="Days open" text-align="end" width="7em" flex-grow="0" resizable></vaadin-grid-sort-column>
        <vaadin-grid-sort-column path="merged" header="Merged" text-align="center" width="7em" flex-grow="0" resizable></vaadin-grid-sort-column>
        <vaadin-grid-sort-column path="status" header="Status" text-align="center" width="7em" flex-grow="0" resizable></vaadin-grid-sort-column>
        <vaadin-grid-column path="link" header="Link" text-align="center" width="4em" flex-grow="0" frozen></vaadin-grid-column>
      </vaadin-grid>
      ${this.data.length 
        ? html`
            <div class="grid-footer">
              <span>Showing ${this.data.length} of ${this.metadata.totalCount} items.</span>
              ${(this.metadata.totalCount > this.data.length) ? html`<span>Try narrowing down your search results with a more specific query.</span>` : ''}
            </div>
          `
        : ''}
    `;
  }
}

customElements.define('ghs-pr-table', GhsPrTable);
