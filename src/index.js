async function fetchWithRetry(url, options, retries = 2, delay = 1000) {
	let attempt = 0;
	while (attempt < retries) {
		try {
			const response = await fetch(url, options);
			// console.log('response', response);

			if (response.status >= 200 && response.status < 300) {
				return response;
			}

			if (response.status === 302) {
				return response;
			}
		} catch (error) {
			console.log('error:', error);
			attempt++;
			if (attempt >= retries) {
				throw new Error(`Failed to fetch after ${retries} attempts: ${error.message}`);
			}
			const retryDelay = delay * Math.pow(2, attempt - 1);
			await new Promise((resolve) => setTimeout(resolve, retryDelay));
		}
	}
	throw new Error('Failed to fetch after retrying');
}

// Main worker fetch function
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const targetURL = 'https://payment.ivacbd.com' + url.pathname + url.search;

		console.log(request);

		// console.log('targetURL', targetURL);
		// Handle preflight requests for CORS
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': '*', // Allow all origins
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization',
					'Access-Control-Max-Age': '86400',
				},
			});
		}

		try {
			// Forward the original request to the target API
			const payload = await request.text();

			const apiResponse = await fetchWithRetry(targetURL, {
				method: request.method,
				headers: request.headers,
				body: request.method === 'POST' ? payload : null,
				credentials: 'include',
				redirect: 'manual',
			});

			const modifiedHeaders = new Headers();
			modifiedHeaders.set('Access-Control-Allow-Origin', '*');
			modifiedHeaders.set('Access-Control-Allow-Credentials', 'true');
			const setCookieHeader = apiResponse.headers.getSetCookie();

			if (setCookieHeader?.length) {
				const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
				for (const cookie of cookies) {
					modifiedHeaders.append('Set-Cookie', cookie);
				}
			}

			if (apiResponse.status === 302) {
				const location = apiResponse.headers.get('Location');
				modifiedHeaders.set('Location', location);
				return new Response(null, {
					status: 302,
					statusText: 'Found',
					headers: modifiedHeaders,
				});
			}

			if (url.pathname === '/' && request.method === 'GET') {
				return new Response(apiResponse.body, {
					status: 200,
					statusText: 'OK',
					headers: modifiedHeaders,
				});
			} else {
				const data = await apiResponse.json();
				return new Response(JSON.stringify(data), {
					status: apiResponse.status,
					statusText: apiResponse.statusText,
					headers: modifiedHeaders,
				});
			}
		} catch (error) {
			// console.log('error', error);
			console.error(`Error: ${error.message}`);
			return new Response(`Error: ${error.message}`, { status: error.status || 500 });
		}
	},
};
