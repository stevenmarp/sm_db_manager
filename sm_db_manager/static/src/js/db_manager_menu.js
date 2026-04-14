/** @odoo-module **/
import { registry } from "@web/core/registry";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { session } from "@web/session";
import { user } from "@web/core/user";
import { DbInfoSection } from "./db_info_component";

const userMenuRegistry = registry.category("user_menuitems");

// Preload group check (resolved on first menu open)
let _isDbUser = null;
let _isDbManager = null;
async function _checkGroups() {
    if (_isDbUser === null) {
        [_isDbUser, _isDbManager] = await Promise.all([
            user.hasGroup("sm_db_manager.group_db_manager_user"),
            user.hasGroup("sm_db_manager.group_db_manager_manager"),
        ]);
    }
}
// Eagerly preload so the value is ready when menu opens
_checkGroups();

// ── Separator before DB section ──
function dbSeparator(env) {
    return {
        type: "separator",
        sequence: 80,
        show: () => _isDbUser,
    };
}

// ── #2 - DB Info Component (shows DB name, size, last backup) ──
function dbInfoItem(env) {
    return {
        type: "component",
        contentComponent: DbInfoSection,
        sequence: 81,
        show: () => _isDbUser,
    };
}

// ── Progress overlay helpers ──
function _createProgressOverlay(dbName) {
    const overlay = document.createElement("div");
    overlay.className = "sm_backup_progress_overlay";
    overlay.innerHTML = `
        <div class="sm_backup_progress_dialog">
            <div class="sm_backup_progress_icon">
                <i class="fa fa-database fa-3x text-primary"></i>
            </div>
            <h5 class="mt-3 mb-1">Backing up database...</h5>
            <p class="text-muted small mb-3">${dbName}</p>
            <div class="sm_backup_progress_bar_wrap">
                <div class="sm_backup_progress_bar" style="width: 0%"></div>
            </div>
            <div class="sm_backup_status mt-2 text-muted small">Preparing backup...</div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function _animateProgress(overlay, token, onComplete) {
    const bar = overlay.querySelector(".sm_backup_progress_bar");
    const status = overlay.querySelector(".sm_backup_status");
    const startTime = Date.now();
    const estimatedMs = 12000;

    const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const raw = 1 - Math.exp((-elapsed / estimatedMs) * 2.5);
        const percent = Math.min(Math.round(raw * 90), 90);
        bar.style.width = percent + "%";

        if (percent < 20) status.textContent = "Dumping database...";
        else if (percent < 50) status.textContent = "Compressing files...";
        else if (percent < 80) status.textContent = "Building archive...";
        else status.textContent = "Almost done...";
    }, 300);

    const cookieInterval = setInterval(() => {
        const cookie = document.cookie
            .split("; ")
            .find((c) => c.startsWith("sm_backup_token="));
        if (cookie && cookie.split("=")[1] === token) {
            document.cookie = "sm_backup_token=; Max-Age=0; Path=/";
            clearInterval(progressInterval);
            clearInterval(cookieInterval);
            bar.style.width = "100%";
            status.innerHTML = '<i class="fa fa-check text-success me-1"></i>Download started!';
            setTimeout(() => {
                overlay.remove();
                onComplete();
            }, 1500);
        }
    }, 500);

    // Fallback: remove overlay after 2 minutes if cookie never arrives
    setTimeout(() => {
        clearInterval(progressInterval);
        clearInterval(cookieInterval);
        if (overlay.parentNode) overlay.remove();
    }, 120000);
}

// ── #1 - Quick Backup (ZIP) ──
function quickBackupItem(env) {
    return {
        type: "item",
        id: "quick_backup",
        description: _t("Quick Backup (ZIP)"),
        callback: () => {
            const token = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const dbName = session.db || "";

            // Show progress overlay
            const overlay = _createProgressOverlay(dbName);
            _animateProgress(overlay, token, () => {
                env.services.notification.add(_t("Backup completed!"), {
                    type: "success",
                });
            });

            // Submit form to hidden iframe
            const iframe = document.createElement("iframe");
            iframe.name = "sm_backup_frame";
            iframe.style.display = "none";
            document.body.appendChild(iframe);

            const form = document.createElement("form");
            form.method = "POST";
            form.action = "/sm_db_manager/backup";
            form.target = "sm_backup_frame";

            const addField = (name, value) => {
                const input = document.createElement("input");
                input.type = "hidden";
                input.name = name;
                input.value = value;
                form.appendChild(input);
            };
            addField("backup_format", "zip");
            addField("backup_token", token);

            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);

            // Cleanup iframe later
            setTimeout(() => {
                if (iframe.parentNode) iframe.remove();
            }, 120000);
        },
        sequence: 82,
        show: () => _isDbManager,
    };
}

// ── #6 - Copy DB Name to Clipboard ──
function copyDbNameItem(env) {
    const dbName = session.db || "";
    return {
        type: "item",
        id: "copy_db_name",
        description: _t("Copy DB Name"),
        callback: async () => {
            try {
                await browser.navigator.clipboard.writeText(dbName);
                env.services.notification.add(
                    _t("Copied: %s", dbName),
                    { type: "success" }
                );
            } catch {
                env.services.notification.add(_t("Failed to copy"), {
                    type: "danger",
                });
            }
        },
        sequence: 83,
        show: () => _isDbUser,
    };
}

// ── Database Manager (open in new tab) ──
function databaseManagerItem(env) {
    const databaseURL = "/web/database/manager";
    return {
        type: "item",
        id: "database_manager",
        description: _t("Database Manager"),
        href: databaseURL,
        callback: () => {
            browser.open(databaseURL, "_blank");
        },
        sequence: 84,
        show: () => _isDbManager,
    };
}

userMenuRegistry
    .add("db_separator", dbSeparator)
    .add("db_info", dbInfoItem)
    .add("quick_backup", quickBackupItem)
    .add("copy_db_name", copyDbNameItem)
    .add("database_manager", databaseManagerItem);
