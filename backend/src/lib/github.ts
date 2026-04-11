const GITHUB_API = 'https://api.github.com'

interface GitHubFile {
  path: string
  content: string
}

async function githubFetch(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'purroxy-api',
      ...options.headers
    }
  })
}

export async function createSubmissionPR(
  token: string,
  repo: string,
  submissionId: string,
  capabilityName: string,
  hostname: string,
  authorEmail: string,
  capabilityData: {
    name: string
    description: string
    hostname: string
    actions: unknown
    parameters: unknown
    extractionRules: unknown
    viewport: unknown
  }
): Promise<{ prNumber: number; prUrl: string }> {
  // 1. Get the default branch and its latest SHA
  const repoRes = await githubFetch(`/repos/${repo}`, token)
  if (!repoRes.ok) throw new Error(`Failed to get repo: ${repoRes.status}`)
  const repoData = await repoRes.json() as any
  const defaultBranch = repoData.default_branch || 'main'

  const refRes = await githubFetch(`/repos/${repo}/git/ref/heads/${defaultBranch}`, token)
  if (!refRes.ok) throw new Error(`Failed to get branch ref: ${refRes.status}`)
  const refData = await refRes.json() as any
  const baseSha = refData.object.sha

  // 2. Create a new branch
  const slug = hostname.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const branchName = `submission/${slug}-${submissionId.slice(0, 8)}`

  const branchRes = await githubFetch(`/repos/${repo}/git/refs`, token, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: baseSha
    })
  })
  if (!branchRes.ok) throw new Error(`Failed to create branch: ${branchRes.status}`)

  // 3. Create the capability file via tree + commit
  const capFile: GitHubFile = {
    path: `capabilities/${slug}/${capabilityData.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`,
    content: JSON.stringify(capabilityData, null, 2)
  }

  const readmeFile: GitHubFile = {
    path: `capabilities/${slug}/README.md`,
    content: `# ${hostname}\n\n## ${capabilityData.name}\n\n${capabilityData.description}\n\nSubmitted by: ${authorEmail.split('@')[0]}\n`
  }

  // Create blobs
  const blobs = await Promise.all(
    [capFile, readmeFile].map(async file => {
      const res = await githubFetch(`/repos/${repo}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({
          content: file.content,
          encoding: 'utf-8'
        })
      })
      if (!res.ok) throw new Error(`Failed to create blob: ${res.status}`)
      const data = await res.json() as any
      return { path: file.path, sha: data.sha }
    })
  )

  // Create tree
  const treeRes = await githubFetch(`/repos/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseSha,
      tree: blobs.map(b => ({
        path: b.path,
        mode: '100644',
        type: 'blob',
        sha: b.sha
      }))
    })
  })
  if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`)
  const treeData = await treeRes.json() as any

  // Create commit
  const commitRes = await githubFetch(`/repos/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({
      message: `Add capability: ${capabilityData.name} (${hostname})`,
      tree: treeData.sha,
      parents: [baseSha]
    })
  })
  if (!commitRes.ok) throw new Error(`Failed to create commit: ${commitRes.status}`)
  const commitData = await commitRes.json() as any

  // Update branch ref
  await githubFetch(`/repos/${repo}/git/refs/heads/${branchName}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitData.sha })
  })

  // 4. Create PR
  const prRes = await githubFetch(`/repos/${repo}/pulls`, token, {
    method: 'POST',
    body: JSON.stringify({
      title: `New capability: ${capabilityData.name}`,
      head: branchName,
      base: defaultBranch,
      body: [
        `## Submission`,
        `- **Capability:** ${capabilityData.name}`,
        `- **Site:** ${hostname}`,
        `- **Author:** ${authorEmail.split('@')[0]}`,
        `- **Description:** ${capabilityData.description}`,
        '',
        `Submission ID: \`${submissionId}\``,
        '',
        '---',
        'Merging this PR will approve the capability and grant the author free contributor access.'
      ].join('\n')
    })
  })
  if (!prRes.ok) throw new Error(`Failed to create PR: ${prRes.status}`)
  const prData = await prRes.json() as any

  return {
    prNumber: prData.number,
    prUrl: prData.html_url
  }
}

export async function verifyGitHubWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expected = 'sha256=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return expected === signature
}

export async function deleteBranch(token: string, repo: string, branchName: string): Promise<void> {
  await githubFetch(`/repos/${repo}/git/refs/heads/${branchName}`, token, {
    method: 'DELETE'
  })
}
