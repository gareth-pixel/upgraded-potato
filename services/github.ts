

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  path: string; // default: 'public/data/model_result.json'
}

export const getGitHubConfig = (): GitHubConfig | null => {
  const stored = localStorage.getItem('GITHUB_CONFIG');
  return stored ? JSON.parse(stored) : null;
};

export const saveGitHubConfig = (config: GitHubConfig) => {
  localStorage.setItem('GITHUB_CONFIG', JSON.stringify(config));
};

/**
 * Encodes a string to Base64, handling UTF-8 characters (e.g., Chinese) correctly.
 */
const utf8_to_b64 = (str: string): string => {
  return window.btoa(unescape(encodeURIComponent(str)));
};

const b64_to_utf8 = (str: string): string => {
  return decodeURIComponent(escape(window.atob(str)));
};

export const fetchFromGitHub = async (config: GitHubConfig) => {
  const { token, owner, repo, path } = config;
  // Cache bust
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?t=${new Date().getTime()}`;
  
  const headers: any = {
    'Accept': 'application/vnd.github.v3+json',
  };
  
  // If token is present, use it. Public repos might work without it for GET, 
  // but better to use if available for rate limits.
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 404) return null; // File doesn't exist yet
    throw new Error(`GitHub Fetch Error: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  // GitHub API returns content in base64 with newlines
  const content = data.content.replace(/\n/g, '');
  const jsonStr = b64_to_utf8(content);
  return JSON.parse(jsonStr);
};

export const uploadToGitHub = async (
  config: GitHubConfig, 
  newContentObj: object, 
  message: string
) => {
  const { token, owner, repo, path } = config;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  try {
    // 1. Get existing file to find SHA (and merge content if needed)
    let sha: string | undefined;
    let existingContent = {};

    const getRes = await fetch(url, { headers });
    
    if (getRes.status === 200) {
      const data = await getRes.json();
      sha = data.sha;
      // Decode existing content to merge
      // GitHub API returns content in base64 with newlines
      try {
        const cleanContent = data.content.replace(/\n/g, '');
        const jsonStr = b64_to_utf8(cleanContent);
        existingContent = JSON.parse(jsonStr);
      } catch (e) {
        console.warn("Failed to parse existing remote JSON, overwriting...", e);
      }
    } else if (getRes.status !== 404) {
      throw new Error(`GitHub API Error (Get): ${getRes.statusText}`);
    }

    // 2. Merge new content with existing
    // We assume the top-level keys are model identifiers (e.g., 'rf_model_online')
    const finalContent = {
      ...existingContent,
      ...newContentObj
    };

    // 3. Upload (PUT)
    const contentEncoded = utf8_to_b64(JSON.stringify(finalContent, null, 2));

    const putBody = {
      message,
      content: contentEncoded,
      sha, // Required if updating
    };

    const putRes = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const errData = await putRes.json();
      throw new Error(`GitHub API Error (Put): ${errData.message || putRes.statusText}`);
    }

    return await putRes.json();
  } catch (error: any) {
    throw new Error(`GitHub Sync Failed: ${error.message}`);
  }
};
