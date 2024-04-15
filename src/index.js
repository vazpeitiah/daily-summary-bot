const { Cron } = require("croner");
require("dotenv").config();
const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_KEY });

const createPage = async ({ pageName, blocks = [] }) => {
  try {
    const newPage = await notion.pages.create({
      parent: {
        page_id: process.env.NOTION_PAGE_ID,
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: pageName,
              },
            },
          ],
        },
      },
      children: blocks.flatMap((block) => [
        {
          object: "block",
          heading_3: {
            rich_text: [
              {
                text: {
                  content: block.title ?? "",
                },
              },
            ],
          },
        },
        ...block.content,
      ]),
    });
  } catch (error) {
    console.error(error.body);
  }
};

const formatDate = (date) => {
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const parsePayloadDate = (date) => {
  const dateObj = new Date(date);
  return dateObj.toISOString().split("T")[0];
};

const getTasksByDate = async (date) => {
  try {
    const databaseId = process.env.NOTION_DATABASE_ID;
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Date",
        date: {
          on_or_after: parsePayloadDate(date),
        },
      },
    });
    return response.results.map((page) => ({
      title: page.properties.Name.title[0].text.content,
      pageId: page.id,
    }));
  } catch (error) {
    console.error(error);
  }
};

const retrieveBlocks = async (pageId) => {
  try {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 50,
    });
    return response.results
      .filter((block) => block.type === "paragraph")
      .map((block) => ({
        object: "block",
        paragraph: {
          rich_text: [
            {
              text: {
                content: block.paragraph.rich_text
                  .map((text) => text.text.content)
                  .join(" "),
              },
            },
          ],
        },
      }));
  } catch (error) {
    console.error(error);
  }
};

/* get last business day before today */
const getLastBusinessDay = () => {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? 2 : day === 1 ? 3 : 1;
  const lastBusinessDay = new Date();
  lastBusinessDay.setDate(today.getDate() - diff);
  return lastBusinessDay;
};

const job = new Cron("* * * * *", async () => {
  const date = getLastBusinessDay();
  const tasks = await getTasksByDate(date);

  if (tasks) {
    const taskDetails = await Promise.all(
      tasks.map((task) => retrieveBlocks(task.pageId))
    );
    await createPage({
      pageName: formatDate(date),
      blocks: tasks.map((task, index) => ({
        title: `${index}${task.title}`,
        content: taskDetails[tasks.indexOf(task)],
      })),
    });
    console.log("Page created!");
  }
});
