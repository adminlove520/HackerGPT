import { Message } from '@/types/chat';
import endent from 'endent';

import { checkToolRateLimit } from '@/pages/api/chat/plugins/tools';

export const isCvemapCommand = (message: string) => {
  if (!message.startsWith('/')) return false;

  const trimmedMessage = message.trim();
  const commandPattern = /^\/cvemap(?:\s+(-[a-z]+|\S+))*$/;

  return commandPattern.test(trimmedMessage);
};

const displayHelpGuide = () => {
  return `
  [CVEMap](https://github.com/projectdiscovery/cvemap) is an open-source command-line interface (CLI) tool that allows you to explore Common Vulnerabilities and Exposures (CVEs).

    Usage:
       /cvemap [flags]
  
    Flags:
    OPTIONS:
        -id string[]                    cve to list for given id
        -cwe, -cwe-id string[]          cve to list for given cwe id
        -v, -vendor string[]            cve to list for given vendor
        -p, -product string[]           cve to list for given product
        -eproduct string[]              cves to exclude based on products
        -s, -severity string[]          cve to list for given severity
        -cs, -cvss-score string[]       cve to list for given cvss score
        -c, -cpe string                 cve to list for given cpe
        -es, -epss-score string         cve to list for given epss score
        -ep, -epss-percentile string[]  cve to list for given epss percentile
        -age string                     cve to list published by given age in days
        -a, -assignee string[]          cve to list for given publisher assignee
        -vs, -vstatus value             cve to list for given vulnerability status in cli output. supported: new, confirmed, unconfirmed, modified, rejected, unknown

    UPDATE:
        -up, -update                 update cvemap to latest version
        -duc, -disable-update-check  disable automatic cvemap update check

    FILTER:
        -q, -search string  search in cve data
        -k, -kev            display cves marked as exploitable vulnerabilities by cisa (default true)
        -t, -template       display cves that has public nuclei templates (default true)
        -poc                display cves that has public published poc (default true)
        -h1, -hackerone     display cves reported on hackerone (default true)
        -re, -remote        display remotely exploitable cves (AV:N & PR:N | PR:L) (default true)

    OUTPUT:
        -f, -field value     fields to display in cli output. supported: product, vendor, assignee, age, poc, cwe, epss, vstatus, kev, template
        -fe, -exclude value  fields to exclude from cli output. supported: product, vendor, assignee, age, poc, cwe, epss, vstatus, kev, template
        -lsi, -list-id       list only the cve ids in the output
        -l, -limit int       limit the number of results to display (default 50)
        -offset int          offset the results to display
        -j, -json            return output in json format

    DEBUG:
        -silent   Silent
        -verbose  Verbose`;
};

interface CvemapParams {
  ids?: string[];
  cwes?: string[];
  vendors?: string[];
  products?: string[];
  excludeProducts?: string[];
  severity?: string[];
  cvssScores?: string[];
  cpe?: string;
  epssScores?: string;
  epssPercentiles?: string[];
  age?: string;
  assignees?: string[];
  vulnerabilityStatus?: string;
  searchTerms?: string[];
  kev?: boolean;
  template?: boolean;
  poc?: boolean;
  hackerone?: boolean;
  remote?: boolean;
  fieldsToDisplay?: string[];
  excludeFields?: string[];
  listIdsOnly?: boolean;
  limit?: number;
  offset?: number;
  json?: boolean;
  error?: string | null;
}

const parseCommandLine = (input: string): CvemapParams => {
  const MAX_INPUT_LENGTH = 500;

  const params: CvemapParams = {
    limit: 50,
    offset: 0,
    json: false,
  };

  if (input.length > MAX_INPUT_LENGTH) {
    params.error = '🚨 Input command is too long.';
    return params;
  }

  const trimmedInput = input.trim().toLowerCase();
  const args = trimmedInput.split(' ');

  // Skipping the first argument if it's assumed to be the tool's name
  if (args[0] === 'cvemap') {
    args.shift();
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-id':
        params.ids = args[++i].split(',');
        break;
      case '-cwe':
      case '-cwe-id':
        params.cwes = args[++i].split(',');
        break;
      case '-v':
      case '-vendor':
        params.vendors = args[++i].split(',');
        break;
      case '-p':
      case '-product':
        params.products = args[++i].split(',');
        break;
      case '-eproduct':
        params.excludeProducts = args[++i].split(',');
        break;
      case '-s':
      case '-severity':
        params.severity = args[++i].split(',');
        break;
      case '-cs':
      case '-cvss-score':
        params.cvssScores = args[++i].split(',');
        break;
      case '-cpe':
        params.cpe = args[++i];
        break;
      case '-epss-score':
        params.epssScores = args[++i];
        break;
      case '-epss-percentile':
        params.epssPercentiles = args[++i].split(',');
        break;
      case '-age':
        params.age = args[++i];
        break;
      case '-assignee':
        params.assignees = args[++i].split(',');
        break;
      case '-vstatus':
        params.vulnerabilityStatus = args[++i];
        break;
      case '-search':
        params.searchTerms = args[++i].split(',');
        break;
      case '-kev':
        params.kev = true;
        break;
      case '-template':
        params.template = true;
        break;
      case '-poc':
        params.poc = true;
        break;
      case '-hackerone':
        params.hackerone = true;
        break;
      case '-remote':
        params.remote = true;
        break;
      case '-fields':
        params.fieldsToDisplay = args[++i].split(',');
        break;
      case '-exclude-fields':
        params.excludeFields = args[++i].split(',');
        break;
      case '-list-id':
        params.listIdsOnly = true;
        break;
      case '-l':
      case '-limit':
        const limit = parseInt(args[++i], 10);
        if (!isNaN(limit)) params.limit = limit;
        break;
      case '-offset':
        const offset = parseInt(args[++i], 10);
        if (!isNaN(offset)) params.offset = offset;
        break;
      case '-j':
      case '-json':
        params.json = true;
        break;
      default:
        break;
    }
  }

  return params;
};

export async function handleCvemapRequest(
  lastMessage: Message,
  corsHeaders: HeadersInit | undefined,
  enableCvemapFeature: boolean,
  OpenAIStream: {
    (
      model: string,
      messages: Message[],
      answerMessage: Message,
      toolId: string,
    ): Promise<ReadableStream<any>>;
    (arg0: any, arg1: any, arg2: any): any;
  },
  model: string,
  messagesToSend: Message[],
  answerMessage: Message,
  authToken: any,
  invokedByToolId: boolean,
) {
  if (!enableCvemapFeature) {
    return new Response('The CVEMap is disabled.', {
      status: 200,
      headers: corsHeaders,
    });
  }

  const toolId = 'cvemap';
  let aiResponse = '';

  if (invokedByToolId) {
    const answerPrompt = transformUserQueryToCvemapCommand(lastMessage);
    answerMessage.content = answerPrompt;

    const openAIResponseStream = await OpenAIStream(
      model,
      messagesToSend,
      answerMessage,
      toolId,
    );

    const reader = openAIResponseStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      aiResponse += new TextDecoder().decode(value, { stream: true });
    }

    try {
      const jsonMatch = aiResponse.match(/```json\n\{.*?\}\n```/s);
      if (jsonMatch) {
        const jsonResponseString = jsonMatch[0].replace(/```json\n|\n```/g, '');
        const jsonResponse = JSON.parse(jsonResponseString);
        lastMessage.content = jsonResponse.command;
      } else {
        return new Response(
          `${aiResponse}\n\nNo JSON command found in the AI response.`,
          {
            status: 200,
            headers: corsHeaders,
          },
        );
      }
    } catch (error) {
      return new Response(
        `${aiResponse}\n\n'Error extracting and parsing JSON from AI response: ${error}`,
        {
          status: 200,
          headers: corsHeaders,
        },
      );
    }
  }

  const parts = lastMessage.content.split(' ');
  if (parts.includes('-h') || parts.includes('-help')) {
    return new Response(displayHelpGuide(), {
      status: 200,
      headers: corsHeaders,
    });
  }

  const params = parseCommandLine(lastMessage.content);

  if (params.error && invokedByToolId) {
    return new Response(`${aiResponse}\n\n${params.error}`, {
      status: 200,
      headers: corsHeaders,
    });
  } else if (params.error) {
    return new Response(params.error, { status: 200, headers: corsHeaders });
  }

  if (authToken !== process.env.SECRET_AUTH_PLUGINS_HACKERGPT_V2) {
    const rateLimitCheck = await checkToolRateLimit(authToken, toolId);

    if (rateLimitCheck.isRateLimited) {
      return rateLimitCheck.response;
    }
  }

  interface CvemapRequestBody {
    ids?: string[];
    cwes?: string[];
    vendors?: string[];
    products?: string[];
    excludeProducts?: string[];
    severity?: string[];
    cvssScores?: string[];
    cpe?: string;
    epssScores?: string;
    epssPercentiles?: string[];
    age?: string;
    assignees?: string[];
    vstatus?: string;
    search?: string;
    kev?: boolean;
    template?: boolean;
    poc?: boolean;
    hackerone?: boolean;
    remote?: boolean;
    fields?: string[];
    excludeFields?: string[];
    listId?: boolean;
    limit?: number;
    offset?: number;
    json?: boolean;
  }

  let cvemapUrl = `${process.env.SECRET_GKE_PLUGINS_BASE_URL}/api/chat/plugins/cvemap`;

  const buildCvemapRequestBody = (
    userInputs: Partial<CvemapRequestBody>,
  ): CvemapRequestBody => {
    let requestBody: CvemapRequestBody = {};

    // Only add properties to requestBody if they are provided by the user
    if (userInputs.ids && userInputs.ids.length)
      requestBody.ids = userInputs.ids;
    if (userInputs.cwes && userInputs.cwes.length)
      requestBody.cwes = userInputs.cwes;
    if (userInputs.vendors && userInputs.vendors.length)
      requestBody.vendors = userInputs.vendors;
    if (userInputs.products && userInputs.products.length)
      requestBody.products = userInputs.products;
    if (userInputs.excludeProducts && userInputs.excludeProducts.length)
      requestBody.excludeProducts = userInputs.excludeProducts;
    if (userInputs.severity && userInputs.severity.length)
      requestBody.severity = userInputs.severity;
    if (userInputs.cvssScores && userInputs.cvssScores.length)
      requestBody.cvssScores = userInputs.cvssScores;
    if (userInputs.cpe) requestBody.cpe = userInputs.cpe;
    if (userInputs.epssScores) requestBody.epssScores = userInputs.epssScores;
    if (userInputs.epssPercentiles && userInputs.epssPercentiles.length)
      requestBody.epssPercentiles = userInputs.epssPercentiles;
    if (userInputs.age) requestBody.age = userInputs.age;
    if (userInputs.assignees && userInputs.assignees.length)
      requestBody.assignees = userInputs.assignees;
    if (userInputs.vstatus) requestBody.vstatus = userInputs.vstatus;
    if (userInputs.search) requestBody.search = userInputs.search;
    if (userInputs.kev !== undefined) requestBody.kev = userInputs.kev;
    if (userInputs.template !== undefined)
      requestBody.template = userInputs.template;
    if (userInputs.poc !== undefined) requestBody.poc = userInputs.poc;
    if (userInputs.hackerone !== undefined)
      requestBody.hackerone = userInputs.hackerone;
    if (userInputs.remote !== undefined) requestBody.remote = userInputs.remote;
    if (userInputs.fields && userInputs.fields.length > 0) {
      requestBody.fields = userInputs.fields;
    }
    if (userInputs.excludeFields && userInputs.excludeFields.length > 0) {
      requestBody.excludeFields = userInputs.excludeFields;
    }
    if (userInputs.listId !== undefined) requestBody.listId = userInputs.listId;
    if (userInputs.limit !== undefined) requestBody.limit = userInputs.limit;
    if (userInputs.offset !== undefined) requestBody.offset = userInputs.offset;
    if (userInputs.json !== undefined) requestBody.json = userInputs.json;

    return requestBody;
  };

  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'text/event-stream');
  headers.set('Cache-Control', 'no-cache');
  headers.set('Connection', 'keep-alive');

  const requestBodyJson = JSON.stringify(buildCvemapRequestBody(params));

  const stream = new ReadableStream({
    async start(controller) {
      const sendMessage = (
        data: string,
        addExtraLineBreaks: boolean = false,
      ) => {
        const formattedData = addExtraLineBreaks ? `${data}\n\n` : data;
        controller.enqueue(new TextEncoder().encode(formattedData));
      };

      if (invokedByToolId) {
        sendMessage(aiResponse, true);
      }

      // sendMessage('🚀 Starting the scan. It might take a minute.', true);

      const intervalId = setInterval(() => {
        sendMessage(
          '⏳ Scanning in progress. We appreciate your patience.',
          true,
        );
      }, 15000);

      try {
        const cvemapResponse = await fetch(cvemapUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `${process.env.SECRET_AUTH_PLUGINS}`,
              Host: 'plugins.hackergpt.co',
          },
          body: requestBodyJson,
        });

        let cvemapData = await cvemapResponse.text();

        cvemapData = processCvemapData(cvemapData);

        if (!cvemapData || cvemapData.length === 0) {
          sendMessage(
            '🔍 The scan is complete. No CVE entries were found based on your parameters.',
            true,
          );
          clearInterval(intervalId);
          controller.close();
          return new Response('No CVE entries found.', {
            status: 200,
            headers,
          });
        }

        clearInterval(intervalId);
        // sendMessage('✅ CVE scan completed! Processing the results...', true);

        if (params.json) {
          const responseString = createResponseString(cvemapData);
          sendMessage(responseString, true);
          controller.close();
          return new Response(cvemapData, {
            status: 200,
            headers: corsHeaders,
          });
        }

        const responseString = createResponseString(
          extractHostsFromCvemapData(cvemapData),
        );
        sendMessage(responseString, true);

        controller.close();
      } catch (error) {
        clearInterval(intervalId);
        let errorMessage =
          '🚨 An unexpected error occurred during the CVE scan. Please try again later.';
        if (error instanceof Error) {
          errorMessage = `🚨 Error: ${error.message}. Please check your request or try again later.`;
        }
        sendMessage(errorMessage, true);
        controller.close();
        return new Response(errorMessage, {
          status: 200,
          headers: corsHeaders,
        });
      }
    },
  });

  return new Response(stream, { headers });
}

const transformUserQueryToCvemapCommand = (lastMessage: Message) => {
  const answerMessage = endent`
  Query: "${lastMessage.content}"

  Based on this query, generate a command for the 'cvemap' tool, focusing on CVE (Common Vulnerabilities and Exposures) discovery. The command should prioritize the most relevant flags for CVE identification and filtering, ensuring the inclusion of flags that specify the criteria such as CVE ID, vendor, or product. The '-json' flag is required by defualt and should be not included only if specified in the user's request. The command should follow this structured format for clarity and accuracy:
  
  ALWAYS USE THIS FORMAT:
  \`\`\`json
  { "command": "cvemap [flags] -json" }
  \`\`\`
  Include any of the additional flags only if they align with the specifics of the request. Ensure the command is properly escaped to be valid JSON.

  Command Construction Guidelines:
  1. **Selective Flag Use**: Carefully select flags that are directly pertinent to the task. The available flags are:
    - -id string[]: Specify CVE ID(s) for targeted searching. (e.g., "CVE-2023-0001")
    - -cwe-id string[]: Filter CVEs by CWE ID(s) for category-specific searching. (e.g., "CWE-79")
    - -vendor string[]: List CVEs associated with specific vendor(s). (e.g., "microsoft")
    - -product string[]: Specify product(s) to filter CVEs accordingly. (e.g., "windows 10")
    - -eproduct string[]: Exclude CVEs based on specified product(s). (e.g., "linux kernel")
    - -severity string[]: Filter CVEs by given severity level(s). Options: LOW, MEDIUM, HIGH, CRITICAL (e.g., "HIGH")
    - -cvss-score string[]: Filter CVEs by given CVSS score range. (e.g., "">=7"")
    - -cpe string: Specify a CPE URI to filter CVEs related to a particular product and version. (e.g., "cpe:/a:microsoft:windows_10")
    - -epss-score string: Filter CVEs by EPSS score. (e.g., ">=0.01")
    - -epss-percentile string[]: Filter CVEs by given EPSS percentile. (e.g., "">=90"")
    - -age string: Filter CVEs published within a specified age in days. (e.g., "">365"", "360")
    - -assignee string[]: List CVEs for a given publisher assignee. (e.g., "cve@mitre.org")
    - -vstatus value: Filter CVEs by given vulnerability status in CLI output. Supported values: new, confirmed, unconfirmed, modified, rejected, unknown (e.g., "confirmed")
    - -search string: Search within CVE data for specific terms. (e.g., "xss")
    - -kev: Display CVEs marked as exploitable vulnerabilities by CISA (default true).
    - -template: Display CVEs that have public Nuclei templates (default true).
    - -poc: Display CVEs that have a publicly published PoC (default true).
    - -hackerone: Display CVEs reported on HackerOne (default true).
    - -remote: Display remotely exploitable CVEs (AV:N & PR:N | PR:L) (default true).
    - -field value: Specify fields to display in CLI output. Supported fields: product, vendor, assignee, age, poc, cwe, epss, vstatus, kev, template (e.g., "vendor,product,severity")
    - -exclude value: Fields to exclude from CLI output. Supported fields mirror those available for inclusion. (e.g., "epss,kev")
    - -list-id: List only the CVE IDs in the output (no additional parameters required).
    - -limit int: Limit the number of results to display (default 50, specify a different number as needed).
    - -offset int: Offset the results to display (use in pagination, starts from 0).
    - -json: Return output in JSON format (use for structured data needs).
    - -silent: Minimize output to essential information only.
    - -verbose: Provide detailed output for debugging purposes.
    - -help: Provide all flags avaiable and information about tool.
    Do not include any flags not listed here. Use these flags to align with the request's specific requirements. All flags are optional.
  2. **Relevance and Efficiency**: Ensure that the flags chosen for the command are relevant and contribute to an effective and efficient CVEs discovery process.

  Example Commands:
  For listing recent critical CVEs with publicly available PoCs:
  \`\`\`json
  { "command": "cvemap -s critical -poc true -l 10" }
  \`\`\`

  For a request for help or all flags:
  \`\`\`json
  { "command": "cvemap -help" }
  \`\`\`

  Response:`;

  return answerMessage;
};

const processCvemapData = (data: string) => {
  return data
    .split('\n')
    .filter((line) => line && !line.startsWith('data:') && line.trim() !== '')
    .join('');
};

const extractHostsFromCvemapData = (data: string) => {
  try {
    const validJsonString = '[' + data.replace(/}{/g, '},{') + ']';

    const jsonData = JSON.parse(validJsonString);

    return jsonData
      .map((item: { host: any }) => item.host)
      .filter((host: undefined) => host !== undefined)
      .join('\n');
  } catch (error) {
    console.error('Error processing data:', error);
    return '';
  }
};

const createResponseString = (cvemapData: string) => {
  const outerData = JSON.parse(cvemapData);
  const data = JSON.parse(outerData.output);
  let markdownOutput = `## CVE Details Report\n\n`;

  data.forEach((cve: { cve_id: any; cve_description: any; severity: any; cvss_score: any; cvss_metrics: any; weaknesses: any; cpe: any; reference: any; poc: any; age_in_days: any; vuln_status: any; is_poc: any; is_remote: any; is_oss: any; vulnerable_cpe: any; vendor_advisory: any; patch_url: any; is_template: any; is_exploited: any; hackerone: any; shodan: any; oss: any; }) => {
    const { cve_id, cve_description, severity, cvss_score, cvss_metrics, weaknesses, cpe, reference, poc, age_in_days, vuln_status, is_poc, is_remote, is_oss, vulnerable_cpe, vendor_advisory, patch_url, is_template, is_exploited, hackerone, shodan, oss } = cve;

    markdownOutput += `### ${cve_id}\n`;
    markdownOutput += `- **Description**: ${cve_description}\n`;
    markdownOutput += `- **Severity**: ${severity}, **CVSS Score**: ${cvss_score} (${cvss_metrics?.cvss31?.vector})\n`;

    if (weaknesses?.length) {
      markdownOutput += `- **Weaknesses**:\n`;
      weaknesses.forEach((w: { cwe_name: any; cwe_id: any; }) => markdownOutput += `  - ${w.cwe_name || w.cwe_id}\n`);
    }

    if (cpe?.vendor || cpe?.product) {
      markdownOutput += `- **CPE**: ${cpe.vendor || 'Unknown vendor'}:${cpe.product || 'Unknown product'}\n`;
    }

    if (reference?.length) {
      markdownOutput += `- **References**:\n`;
      reference.forEach((ref: any) => markdownOutput += `  - [${ref}](${ref})\n`);
    }

    if (poc?.length) {
      markdownOutput += `- **Proof of Concept**:\n\n`;
      markdownOutput += `| URL | Source | Added At |\n`;
      markdownOutput += `| --- | ------ | -------- |\n`;
      poc.forEach((p: { added_at: string | number | Date; url: any; source: any; }) => {
        const addedAtFormatted = new Date(p.added_at).toISOString().split('T')[0]; // ISO date without time
        markdownOutput += `| [${p.url}](${p.url}) | ${p.source} | ${addedAtFormatted} |\n`;
      });
    }

    // Optional fields handled gracefully
    const addOptionalField = (label: string, value: string) => {
      if (value) markdownOutput += `- **${label}**: ${value}\n`;
    };

    addOptionalField("Age in Days", age_in_days);
    addOptionalField("Vulnerability Status", vuln_status);
    addOptionalField("Proof of Concept Available", is_poc ? 'Yes' : 'No');
    addOptionalField("Remotely Exploitable", is_remote ? 'Yes' : 'No');
    addOptionalField("Open Source Software", is_oss ? 'Yes' : 'No');
    if (vendor_advisory) markdownOutput += `- **Vendor Advisory**: [View Advisory](${vendor_advisory})\n`;
    addOptionalField("Template Available", is_template ? 'Yes' : 'No');
    addOptionalField("Exploited in the Wild", is_exploited ? 'Yes' : 'No');

    if (hackerone?.rank || hackerone?.count !== undefined) {
      markdownOutput += `- **HackerOne**: Rank ${hackerone.rank}, Reports ${hackerone.count}\n`;
    }

    if (shodan?.count) {
      markdownOutput += `- **Shodan**: Count ${shodan.count}\n`;
      if (shodan.query?.length) {
        shodan.query.forEach((query: any) => markdownOutput += `  - Query: ${query}\n`);
      }
    }

    if (oss?.url) {
      markdownOutput += `- **OSS**: [${oss.url}](${oss.url})\n`;
    }

    if (patch_url?.length) {
      markdownOutput += `- **Patch URL**:\n`;
      patch_url.forEach((url: any) => markdownOutput += `  - [Patch](${url})\n`);
    }

    markdownOutput += "\n";
  });

  return markdownOutput;
};
