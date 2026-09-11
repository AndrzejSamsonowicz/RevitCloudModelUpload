/**
 * APS cloud-model publishing helpers.
 *
 * Publishing a Revit cloud model (single-user RCM or workshared C4R) to ACC Docs
 * is a single Data Management command: `C4RModelPublish`. It publishes the model's
 * existing unpublished changes and creates a new viewable version. It never opens
 * the file in a Revit engine, so Design Automation - and the file's Revit version -
 * are irrelevant.
 *
 * Both the manual publish path (routes/dataManagement.js) and the scheduled publish
 * path (routes/designAutomation.js) go through here so they stay identical.
 */

const axios = require('axios');

const APS_BASE = 'https://developer.api.autodesk.com';
const PUBLISH_COMMAND_TYPE = 'commands:autodesk.bim360:C4RModelPublish';
const PUBLISH_JOB_STATUS_COMMAND_TYPE = 'commands:autodesk.bim360:C4RModelGetPublishJob';

/**
 * Resolve a cloud-model URN to its lineage URN (`dm.lineage`), which is what the
 * publish command requires.
 *
 *   - `dm.lineage` URN  -> returned unchanged
 *   - `fs.file` version URN -> resolved via GET /versions/{urn} -> item relationship
 *   - anything else      -> returned unchanged (assumed to already be an item URN)
 *
 * @param {string} projectId - ACC project id, `b.` prefixed
 * @param {string} urn - lineage URN, version URN, or item URN
 * @param {string} token - user 3-legged token
 * @returns {Promise<string>} lineage/item URN
 * @throws if a version URN has no resolvable item relationship
 */
async function resolveLineageId(projectId, urn, token) {
    if (!urn) {
        throw new Error('resolveLineageId: urn is required');
    }
    if (urn.includes('dm.lineage')) {
        return urn;
    }
    if (!urn.includes('fs.file')) {
        return urn;
    }

    const response = await axios.get(
        `${APS_BASE}/data/v1/projects/${projectId}/versions/${encodeURIComponent(urn)}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );

    const lineageId = response.data?.data?.relationships?.item?.data?.id;
    if (!lineageId) {
        throw new Error('Could not resolve item lineage ID from version URN');
    }
    return lineageId;
}

/**
 * Issue the `C4RModelPublish` command for a cloud model.
 *
 * @param {string} projectId - ACC project id, `b.` prefixed
 * @param {string} lineageId - lineage URN (`dm.lineage`)
 * @param {string} token - user 3-legged token
 * @returns {Promise<{commandId: string, status: string}>} status `committed` = accepted
 */
async function publishModel(projectId, lineageId, token) {
    const payload = {
        jsonapi: { version: '1.0' },
        data: {
            type: 'commands',
            attributes: {
                extension: { type: PUBLISH_COMMAND_TYPE, version: '1.0.0' }
            },
            relationships: {
                resources: { data: [{ type: 'items', id: lineageId }] }
            }
        }
    };

    const response = await axios.post(
        `${APS_BASE}/data/v1/projects/${projectId}/commands`,
        payload,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/vnd.api+json'
            }
        }
    );

    return {
        commandId: response.data?.data?.id,
        status: response.data?.data?.attributes?.status
    };
}

/**
 * Check the status of a previously-issued C4RModelPublish job.
 *
 * `C4RModelPublish` returning `status: "committed"` only means the command was
 * *accepted* — it says nothing about whether a new version actually got created.
 * This is the only way to find out; see API_REFERENCE_PUBLISHMODEL.md.
 *
 * @param {string} projectId - ACC project id, `b.` prefixed
 * @param {string} lineageId - lineage URN (`dm.lineage`)
 * @param {string} token - user 3-legged token
 * @returns {Promise<{status: string, isUpToDate: boolean|null, hasConflict: boolean|null}>}
 *          status: 'pending' | 'inprogress' | 'complete' | 'failed' (or 'unknown' if unparseable)
 */
async function getPublishJobStatus(projectId, lineageId, token) {
    const payload = {
        jsonapi: { version: '1.0' },
        data: {
            type: 'commands',
            attributes: {
                extension: { type: PUBLISH_JOB_STATUS_COMMAND_TYPE, version: '1.0.0' }
            },
            relationships: {
                resources: { data: [{ type: 'items', id: lineageId }] }
            }
        }
    };

    const response = await axios.post(
        `${APS_BASE}/data/v1/projects/${projectId}/commands`,
        payload,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/vnd.api+json'
            }
        }
    );

    console.log(`[getPublishJobStatus] raw response for ${lineageId}:`, JSON.stringify(response.data));

    const attrs = response.data?.data?.attributes;
    const data = attrs?.extension?.data || {};
    return {
        status: attrs?.status || 'unknown',
        isUpToDate: data.isUpToDate ?? null,
        hasConflict: data.hasConflict ?? null,
        lastPublishTime: data.lastPublishTime || null
    };
}

/**
 * Issue C4RModelPublish, then poll C4RModelGetPublishJob for a bounded window so the
 * caller gets a real answer instead of trusting the "committed" acceptance status.
 *
 * `status: 'complete'` only means the job finished — it does NOT mean a new version
 * was created. If the cloud model had no unsynchronized changes (isUpToDate was
 * already true beforehand), the job completes as a no-op. We capture `lastPublishTime`
 * before issuing the command and compare it to the value after completion to tell
 * these apart, so callers/logs don't claim a version was published when nothing changed.
 *
 * @returns {Promise<{commandId: string, confirmed: boolean, success: boolean, jobStatus: string, versionCreated: boolean|null, detail: string}>}
 *   confirmed=true  -> jobStatus is 'complete' or 'failed' (success reflects which)
 *   confirmed=false -> still pending/inprogress after maxWaitMs; not a failure, just unresolved
 *   versionCreated  -> only meaningful when jobStatus === 'complete'; null otherwise
 */
async function publishModelAndConfirm(projectId, lineageId, token, { maxWaitMs = 20000, intervalMs = 3000 } = {}) {
    let baselinePublishTime = null;
    try {
        const baseline = await getPublishJobStatus(projectId, lineageId, token);
        baselinePublishTime = baseline.lastPublishTime;
        console.log(`[publishModelAndConfirm] baseline for ${lineageId}: status=${baseline.status}, lastPublishTime=${baseline.lastPublishTime}, isUpToDate=${baseline.isUpToDate}`);
    } catch (err) {
        // Best-effort — if we can't get a baseline, we just can't distinguish
        // "published a new version" from "already up to date" afterward.
        console.warn(`[publishModelAndConfirm] baseline status check failed for ${lineageId}:`, err.response?.data || err.message);
    }

    const { commandId } = await publishModel(projectId, lineageId, token);

    const deadline = Date.now() + maxWaitMs;
    let last = { status: 'pending' };
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        try {
            last = await getPublishJobStatus(projectId, lineageId, token);
        } catch (err) {
            // A transient status-check failure doesn't mean the publish itself failed —
            // keep polling until the deadline rather than giving up on the first hiccup.
            last = { status: 'pending', error: err.response?.data || err.message };
            continue;
        }
        if (last.status === 'complete') {
            const versionCreated = baselinePublishTime !== null
                ? last.lastPublishTime !== baselinePublishTime
                : null;
            console.log(`[publishModelAndConfirm] complete for ${lineageId}: baselineLastPublishTime=${baselinePublishTime}, finalLastPublishTime=${last.lastPublishTime}, versionCreated=${versionCreated}`);
            return {
                commandId, confirmed: true, success: true, jobStatus: 'complete', versionCreated,
                detail: versionCreated === false
                    ? 'Model already up to date - no unpublished changes, no new version created'
                    : 'Publish confirmed complete'
            };
        }
        if (last.status === 'failed') {
            return {
                commandId, confirmed: true, success: false, jobStatus: 'failed', versionCreated: false,
                detail: last.hasConflict ? 'Publish failed: synchronization conflict' : 'Publish job reported failed'
            };
        }
        // 'pending' / 'inprogress' / 'unknown' -> keep polling
    }

    return {
        commandId, confirmed: false, success: null, jobStatus: last.status, versionCreated: null,
        detail: `Publish command accepted but not confirmed complete after ${Math.round(maxWaitMs / 1000)}s (last status: ${last.status})`
    };
}

module.exports = { resolveLineageId, publishModel, getPublishJobStatus, publishModelAndConfirm, PUBLISH_COMMAND_TYPE };
