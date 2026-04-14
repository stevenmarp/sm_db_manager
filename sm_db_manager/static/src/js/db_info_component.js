/** @odoo-module **/
import { Component, useState, onWillStart, onMounted } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { session } from "@web/session";

export class DbInfoSection extends Component {
    static template = "sm_db_manager.DbInfoSection";
    static props = ["*"];

    setup() {
        this.state = useState({
            dbName: session.db || "unknown",
            dbSize: null,
            lastBackup: null,
            lastBackupText: null,
            lastBackupUser: null,
            loaded: false,
        });

        onWillStart(() => this._fetchDbInfo());
        onMounted(() => this._fetchDbInfo());
    }

    async _fetchDbInfo() {
        try {
            const result = await rpc("/sm_db_manager/db_info", {});
            if (result && !result.error) {
                this.state.dbName = result.db_name || this.state.dbName;
                this.state.dbSize = result.db_size_human;
                this.state.lastBackupUser = result.last_backup_user;
                if (result.last_backup) {
                    this.state.lastBackup = result.last_backup;
                    this.state.lastBackupText = this._timeAgo(new Date(result.last_backup));
                } else {
                    this.state.lastBackup = null;
                    this.state.lastBackupText = null;
                    this.state.lastBackupUser = null;
                }
            }
        } catch {
            // silently fail - info section is non-critical
        }
        this.state.loaded = true;
    }

    _timeAgo(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return "just now";
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 30) return `${days}d ago`;
        return date.toLocaleDateString();
    }
}
