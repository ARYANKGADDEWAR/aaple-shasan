// src/services/aiService.js
const axios = require('axios');
const logger = require('../config/logger');
const { cache } = require('../config/redis');

const DEPT_KEYWORDS = {
  PWD: ['road', 'bridge', 'pothole', 'pavement', 'footpath', 'drain', 'drainage', 'flood', 'construction',
        'repair', 'infrastructure', 'building', 'maintenance', 'highway', 'culvert', 'nala', 'gutter',
        'रस्ता', 'पूल', 'निचरा', 'बांधकाम', 'देखभाल'],
  NMC: ['municipal', 'ward', 'garbage', 'waste', 'dustbin', 'water supply', 'sewage', 'streetlight',
        'signal', 'parking', 'market', 'encroachment', 'garden', 'park', 'nmc', 'corporation',
        'कचरा', 'पाणी', 'दिवे', 'महापालिका', 'बाजार'],
  GramPanchayat: ['farm', 'crop', 'agriculture', 'kisan', 'irrigation', 'village', 'gram', 'rural',
                  'soil', 'rain', 'harvest', 'cattle', 'livestock', 'panchayat', 'tribal', 'adivasi',
                  'शेत', 'शेती', 'सिंचन', 'ग्राम', 'किसान', 'पंचायत'],
  RevenueDeskTahsildar: ['land', 'record', 'revenue', 'tahsildar', 'mutation', '7/12', 'survey',
                         'registration', 'property', 'khata', 'plot', 'encroachment on land', 'namunapatrak',
                         'जमीन', 'महसूल', 'तहसीलदार', '७/१२', 'मालमत्ता'],
  SDMDesk: ['sdm', 'sub-divisional', 'certificate', 'caste', 'income', 'domicile', 'permission',
            'license', 'ration card', 'complaint', 'जातप्रमाणपत्र', 'उत्पन्न'],
};

function localClassify(text) {
  const lowerText = text.toLowerCase();
  const scores = {};

  for (const [dept, keywords] of Object.entries(DEPT_KEYWORDS)) {
    scores[dept] = 0;
    for (const kw of keywords) {
      if (lowerText.includes(kw.toLowerCase())) scores[dept] += 10;
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const totalScore = sorted.reduce((sum, [, v]) => sum + v, 0);
  const confidence = totalScore > 0 ? Math.min(95, Math.round((top[1] / totalScore) * 100 + 30)) : 55;

  const normalized = {};
  for (const [dept, score] of sorted) {
    normalized[dept] = totalScore > 0 ? Math.round((score / totalScore) * 100) : 20;
  }

  return {
    dept: top[0],
    confidence,
    scores: normalized,
    method: 'local_keyword',
  };
}

async function classifyProposal(title, description, region) {
  const cacheKey = `ai:classify:${Buffer.from(title + description).toString('base64').slice(0, 32)}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  // Try Anthropic API first
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const prompt = `You are an AI classifier for Maharashtra government civic proposals. Classify this citizen proposal:

Title: "${title}"
Description: "${description}"
Region: "${region}"

Classify into EXACTLY ONE department:
- PWD (Public Works): roads, bridges, drainage, infrastructure, construction
- NMC (Municipal Corporation): waste, water supply, streetlights, encroachments, parks
- GramPanchayat: agriculture, farming, rural development, irrigation, livestock
- RevenueDeskTahsildar: land records, property, 7/12 extracts, mutations
- SDMDesk: certificates, permissions, licenses, caste/income/domicile certificates

Respond ONLY with valid JSON (no markdown):
{
  "dept": "PWD",
  "confidence": 87,
  "scores": {"PWD": 87, "NMC": 8, "GramPanchayat": 3, "RevenueDeskTahsildar": 1, "SDMDesk": 1},
  "budget_estimate": 500000,
  "summary": "Brief AI executive summary (2-3 sentences for the dossier)",
  "keywords": ["keyword1", "keyword2"],
  "priority": "high"
}`;

      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: process.env.AI_MODEL || 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const content = response.data.content[0].text;
      const cleaned = content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const result = {
        dept: parsed.dept || 'PWD',
        confidence: parsed.confidence || 70,
        raw: parsed.scores || {},
        budget_estimate: parsed.budget_estimate || null,
        summary: parsed.summary || null,
        keywords: parsed.keywords || [],
        priority: parsed.priority || 'medium',
        method: 'anthropic_api',
      };

      await cache.set(cacheKey, result, 3600);
      return result;
    } catch (err) {
      logger.warn('Anthropic API classification failed, falling back to local', { error: err.message });
    }
  }

  // Fallback: local keyword classifier
  const local = localClassify(title + ' ' + description);
  const result = {
    dept: local.dept,
    confidence: local.confidence,
    raw: local.scores,
    budget_estimate: null,
    summary: `AI has classified this proposal under ${local.dept} based on keyword analysis of the description. Community approval and departmental review recommended.`,
    keywords: [],
    priority: 'medium',
    method: local.method,
  };

  await cache.set(cacheKey, result, 1800);
  return result;
}

async function compileDossier(proposal, critiques) {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const prompt = `You are an AI officer for Maharashtra government. Compile an executive dossier for this civic proposal:

PROPOSAL DETAILS:
Title: ${proposal.title}
Department: ${proposal.assigned_dept}
Region: ${proposal.region}
Description: ${proposal.description}
Community Upvotes: ${proposal.upvote_count}
Community Downvotes: ${proposal.downvote_count}
Approval %: ${Math.round((proposal.upvote_count / Math.max(1, proposal.upvote_count + proposal.downvote_count)) * 100)}%
AI Confidence: ${proposal.ai_confidence}%

COMMUNITY CRITIQUES:
${critiques.map((c, i) => `${i + 1}. ${c}`).join('\n') || 'None submitted.'}

Write a formal executive dossier in 3 paragraphs:
1. Summary of the civic need and its impact on the community
2. Analysis of community support and any technical alternatives from critiques
3. Officer recommendation with budget note

Keep it professional, concise, and suitable for a government officer to read.`;

      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: process.env.AI_MODEL || 'claude-sonnet-4-6',
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          timeout: 15000,
        }
      );

      return response.data.content[0].text;
    } catch (err) {
      logger.warn('Dossier compilation API failed', { error: err.message });
    }
  }

  const approval = Math.round((proposal.upvote_count / Math.max(1, proposal.upvote_count + proposal.downvote_count)) * 100);
  return `EXECUTIVE DOSSIER — ${proposal.ref_number}

Summary: The proposal titled "${proposal.title}" addresses a civic development need in ${proposal.region}. The citizen has provided a detailed account of the issue which has been AI-classified under ${proposal.assigned_dept} with ${proposal.ai_confidence}% confidence.

Community Assessment: This proposal has received ${proposal.upvote_count} upvotes and ${proposal.downvote_count} downvotes from the community, reflecting a ${approval}% approval rating. ${critiques.length > 0 ? `${critiques.length} constructive critique(s) were submitted by reviewers, suggesting alternative approaches that may reduce cost or improve efficiency.` : 'No significant opposition was recorded in the community review phase.'}

Recommendation: Based on community support metrics and AI analysis, this proposal meets the democratic threshold for administrative consideration. The ${proposal.assigned_dept} desk is recommended to conduct a feasibility assessment and, if viable, proceed with sanction and project implementation under applicable government schemes.`;
}

module.exports = { classifyProposal, compileDossier };
