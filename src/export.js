class ExportWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.apiUrl = 'https://www.ebi.ac.uk/ebisearch/ws/rest/rnacentral';
        this.params = '&size=1000&sort=id&format=json';
        this.query = this.getAttribute('query');
        this.dataType = this.getAttribute('data-type');
        this.jobId = null;
        this.status = 'pending';
        this.progress = 0;
        this.apiDomain = process.env.API_DOMAIN;
        this.shadowRoot.innerHTML = `
            <style>
                .export-text {
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                }
                .export-progress-bar {
                    width: 100%;
                    background-color: #f3f3f3;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    overflow: hidden;
                    height: 20px;
                    margin: 10px 0;
                    position: relative;
                }
                .export-progress-bar-fill {
                    height: 100%;
                    background-color: #007bff;
                    width: 0%;
                    transition: width 0.5s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                }
            </style>
            <div class="export-text">
                <div class="export-progress-bar">
                    <div class="export-progress-bar-fill" id="export-progress-bar-fill"></div>
                </div>
                <div>
                    Your query has been submitted. The results will be automatically downloaded once the export is finished.
                    <ul>
                        <li>Query: ${this.query}</li>
                        <li>Format: ${this.dataType}</li>
                        <li id="status-text">Status: ${this.status}</li>
                    </ul>
                </div>
            </div>    
        `;
    }

    connectedCallback() {
        this.startJob();
    }

    async startJob() {
        try {
            const response = await fetch(`${this.apiDomain}/submit/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_url: this.apiUrl + '?query=(' + this.query + ')' + this.params,
                    data_type: this.dataType
                })
            });
            if (response.status === 200) {
                const data = await response.json();
                this.jobId = data.task_id;
                setTimeout(() => this.checkStatus(), 1000);
            } else {
                this.updateStatus('Error starting job: ' + response.statusText);
            }
        } catch (error) {
            this.updateStatus('Error starting job');
            console.error('Error starting job:', error);
        }
    }

    async checkStatus() {
        try {
            const response = await fetch(`${this.apiDomain}/download/${this.jobId}/${this.dataType}`);
            if (response.headers.get('content-type').includes('application/json')) {
                // export has not yet been completed
                const data = await response.json();

                // calculate the value to be used in the progress bar
                let progress
                if (this.dataType === 'fasta') {
                    progress = (data.progress_ids + data.progress_fasta) / 2 || 0;
                } else if (this.dataType === 'json') {
                    progress = (data.progress_ids + data.progress_db_data) / 2 || 0;
                } else {
                    progress = data.progress_ids || 0;
                }

                // check status
                const status = data.state ? data.state : 'pending';
                if (status === 'RUNNING') {
                    this.updateStatus('running');
                    this.updateProgress(progress);
                    setTimeout(() => this.checkStatus(), 5000);
                } else {
                    this.updateStatus(`${status}`);
                    setTimeout(() => this.checkStatus(), 5000);
                }
            } else {
                // export has been completed
                this.updateStatus('finished');
                this.updateProgress(100);

                // download file
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `${this.jobId}.${this.dataType === 'json' ? 'json.gz' : this.dataType === 'fasta' ? 'fasta.gz' : 'txt.gz'}`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            this.updateStatus('Error checking status');
            console.error('Error checking status:', error);
        }
    }

    updateStatus(status) {
        this.status = status;
        this.shadowRoot.getElementById('status-text').textContent = `Status: ${this.status}`;
    }

    updateProgress(progress) {
        this.progress = progress;
        const progressBarFill = this.shadowRoot.getElementById('export-progress-bar-fill');
        progressBarFill.style.width = `${this.progress}%`;
        progressBarFill.textContent = `${this.progress}%`;
    }
}

customElements.define('rnacentral-export-widget', ExportWidget);