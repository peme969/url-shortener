export default {
	async fetch(request, env) {
	  const { pathname } = new URL(request.url);
	  if (pathname === '/') {
		return new Response('Hello, World!', {
		  headers: { 'Content-Type': 'text/plain' },
		});
	  }
  
	  if (pathname.startsWith('/api')) {
		const storedSecret = env.API_KEY;
		const authHeader = request.headers.get('Authorization');
		if (!storedSecret || !authHeader || authHeader !== `Bearer ${storedSecret}`) {
		  return new Response('Unauthorized', { status: 401 });
		}
  
		if (pathname === '/api/view') {
		  return handleViewAll(env);
		} else if (pathname.startsWith('/api/view/')) {
		  const slug = pathname.split('/api/view/')[1];
		  return handleViewSlug(slug, env);
		} else if (pathname.startsWith('/api/create')) {
		  return handleCreate(request, env);
		} else if (pathname.startsWith('/api/delete')) {
		  return handleDelete(request, env);
		} else {
		  return new Response('API route not found', { status: 404 });
		}
	  }
	  return handleRedirect(pathname, request, env);
	},
  };
  
  async function handleCreate(request, env) {
	const { slug, url, password, expiresAt } = await request.json();
	const generatedSlug = slug || generateSlug();
  
	const metadata = {
	  url,
	  password: password || null,
	  expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
	};
  
	await env.URLS.put(generatedSlug, JSON.stringify(metadata));
	return new Response(JSON.stringify({ slug: generatedSlug, url }), {
	  headers: { 'Content-Type': 'application/json' },
	});
  }
  
  async function handleDelete(request, env) {
	const { slug } = await request.json();
	await env.URLS.delete(slug);
	return new Response(`Deleted slug: ${slug}`);
  }
  
  async function handleViewAll(env) {
	const allKeys = await getAllKeys(env.URLS);
	const allData = [];
  
	for (const key of allKeys) {
	  const data = await env.URLS.get(key.name);
	  allData.push({ slug: key.name, metadata: JSON.parse(data) });
	}
  
	return new Response(JSON.stringify(allData), {
	  headers: { 'Content-Type': 'application/json' },
	});
  }
  
  async function handleViewSlug(slug, env) {
	const data = await env.URLS.get(slug);
	if (!data) {
	  return new Response('Slug not found', { status: 404 });
	}
	return new Response(data, {
	  headers: { 'Content-Type': 'application/json' },
	});
  }
  
  async function handleRedirect(pathname, request, env) {
	const slug = pathname.slice(1); 
	const data = await env.URLS.get(slug);
  
	if (!data) {
	  return new Response('URL not found', { status: 404 });
	}
  
	const { url, password, expiresAt } = JSON.parse(data);
  
	if (expiresAt && Date.now() > expiresAt) {
	  await env.URLS.delete(slug); 
	  return new Response('URL expired and has been deleted.', { status: 410 });
	}
  
	const authHeader = request.headers.get('Authorization');
	if (password) {
	  if (authHeader === `Bearer ${password}`) {
		return Response.redirect(url, 302); 
	  }
  
	  return new Response(renderPasswordPrompt(slug), {
		headers: { 'Content-Type': 'text/html' },
	  });
	}
  
	return Response.redirect(url, 302); 
  }
  
  
  function renderPasswordPrompt(slug) {
	return `
	  <!DOCTYPE html>
	  <html>
	  <head>
		<title>You are accessing a protected URL</title>
		<script>
		  async function checkPassword() {
			const password = prompt("Enter the password:");
			if (password) {
			  const response = await fetch(window.location.href, {
				headers: { Authorization: "Bearer " + password },
			  });
			  if (response.redirected) {
				window.location.href = response.url;
			  } else {
				alert("Incorrect password. Please try again.");
			  }
			}
		  }
		  window.onload = checkPassword;
		</script>
	  </head>
	  <body>
		<p>Please wait while we check if you are the right person to access this URL.</p>
	  </body>
	  </html>
	`;
  }
  
  function generateSlug(length = 6) {
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
  
  async function getAllKeys(kvNamespace) {
	let cursor = null;
	const allKeys = [];
  
	do {
	  const { keys, cursor: nextCursor } = await kvNamespace.list({ cursor });
	  allKeys.push(...keys);
	  cursor = nextCursor;
	} while (cursor);
  
	return allKeys;
  }
  