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

module.exports = { resolveLineageId, publishModel, PUBLISH_COMMAND_TYPE };
