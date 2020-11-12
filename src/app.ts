import express from "express";
import { dbConfig } from "./dbConfig";
import * as dotenv from "dotenv";
dotenv.config();

var cors = require("cors");
const app = express();
const port = 4000;
app.use(cors());
app.get("/assays/:libraryId/:pageId/:pageSize", async (req, res) => {
  const { libraryId, pageId, pageSize } = req.params;
  const results = await getResults(+libraryId, +pageId, +pageSize);
  res.send(results.rows);
});

app.get("/autocomplete/:query/:top?", async (req, res) => {
  const { query } = req.params;
  const results = await getSuggestions(query, 10);
  res.send(results.rows);
});

app.get(
  "/sort/:direction/:library/:assayId/:pageNum/:pageSize",
  async (req, res) => {
    const { direction, library, assayId, pageNum, pageSize } = req.params;
    let results;
    console.log('assayId', assayId)
    if(+assayId < 1000) {
     results = await sort(direction, library, assayId, pageNum, pageSize);
    }else{
      results = await sortText(direction, library, assayId, pageNum, pageSize);
    }

    res.send(results.rows);
  }
);

app.get(
  "/search/:text",
  async (req, res) => {
    const { text } = req.params;
    const results = await search(text);
    res.send(results.rows);
  }
);

app.listen(port, () => {
  return console.log(`server is listening on ${port}`);
});

/* https://oracle.github.io/node-oracledb/INSTALL.html#instwin
To avoid interfering with existing tools that require other Oracle Client versions then, instead of updating the system-wide PATH variable, you may prefer to write a batch file that sets PATH, for example:
REM mynode.bat
SET PATH=C:\oracle\instantclient_19_6;%PATH%
node %*
Invoke this batch file every time you want to run Node.js.
Alternatively use SET to change your PATH in each command prompt window before you run node.*/
const DICTIONARY_TABLE = "TEST_COV2_DICTIONARY";
const MAIN_COLUMNS =
  "a.SAMPLE_ID," +
  "a.ACTIVITY_JSON," +
  "a.PRIMARY_MOA," +
  "a.LIBRARY_ID," +
  'NVL(a.SAMPLE_NAME, a.SAMPLE_ID) as "SAMPLE_NAME" ';
const RESULT_TABLE = "TEST_COV2_RESULT";
const PROTOCOL_TABLE = "TEST_COV2_PROTOCOL";
const DATA_TABLE = "TEST_COV2_DATA";
const oracledb = require("oracledb");


async function getSuggestions(queryTxt: string, top: number) {
  let connection;
  let results;
  try {
    let binds, options;
    console.log(dbConfig);
    connection = await oracledb.getConnection({
      user: dbConfig.user,
      password: process.env.NODE_ORACLEDB_PASSWORD,
      connectString: dbConfig.connectString,
    });

    const query =
      `select iword as "data", word ||' ['||label||']' as "value" 
      from ${DICTIONARY_TABLE}
      where iword like (:text)
      offset 0 rows fetch next :top rows only`;

    binds = {text: `${queryTxt.toLowerCase()}%`, top};
    options = {
      outFormat: oracledb.OUT_FORMAT_OBJECT, // query result format
    };
    oracledb.fetchAsString = [oracledb.CLOB];
    results = await connection.execute(query, binds, options);
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
    return results;
  }
}



async function sortText(direction, libraryId, assayId, pageNum, pageSize) {
  let connection;
  let results;
  try {
    let sql, binds, options, result;
    console.log(dbConfig);
    connection = await oracledb.getConnection({
      user: dbConfig.user,
      password: process.env.NODE_ORACLEDB_PASSWORD,
      connectString: dbConfig.connectString,
    });

    let column = "SAMPLE_NAME";//9800
		if(+assayId == 6701)
			column = "PRIMARY_MOA";
		
		 const orderBy = " NLSSORT(a."+column+", 'NLS_SORT=GENERIC_M') " + direction + " nulls last ";
			
		//System.out.println("sort by "+column);
	 
		const skip = (pageNum<=0?0:(pageNum-1)) * pageSize;
		let where = "";
		let query;
		
		if(libraryId > 0)
			where = 'where a.library_id= :libraryId '; //"where a.library_id="+libraryId + ' ';
			
		query ="select "
					+  MAIN_COLUMNS + ', '
					+ "count(*) OVER() as \"count\"" + ' '
					+ "FROM "
					+ RESULT_TABLE+" a  "
					+ where
					+ "order by "+ orderBy
					+ "offset "+skip+" rows fetch next "+pageSize+" rows only ";

    binds = {libraryId, };
    options = {
      outFormat: oracledb.OUT_FORMAT_OBJECT, // query result format
    };
    oracledb.fetchAsString = [oracledb.CLOB];
    results = await connection.execute(query, binds, options);
    results.rows.map((r) => {
      const entries = r.ACTIVITY_JSON.split(",");
      const deserialized = {};
      entries.forEach((e) => {
        const keys = e.split(":");
        const formatKeys = keys[0].split("_");
        const name =
          formatKeys.length > 4
            ? `${formatKeys[0]}_${formatKeys[4]}`
            : formatKeys[0];
        deserialized[name] = keys[1];
      });
      r.ACTIVITY_JSON = deserialized;
    });
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
    return results;
  }
}

// https://stackoverflow.com/questions/59691695/how-to-do-pattern-matching-query-in-node-oracledb
async function search(text: string) {
  let connection;
  let results;
  try {
    let binds, options;
    // console.log(dbConfig);
    connection = await oracledb.getConnection({
      user: dbConfig.user,
      password: process.env.NODE_ORACLEDB_PASSWORD,
      connectString: dbConfig.connectString,
    });

    console.log(text);
    const searchTxt = text.toLowerCase();
    const query =
      "select " +
      MAIN_COLUMNS +
      " " +
      "FROM " +
      RESULT_TABLE +
      " a " +
      "where a.search_item like :item " +
      /*"%'*/ "or a.drug_name_lower like :item " +
      // searchTxt +
      // "%' " +
      "order by a.sample_id";
    console.log('query ' + query);
    options = {
      outFormat: oracledb.OUT_FORMAT_OBJECT, // query result format
    };
    binds = {item: `%${searchTxt}%`};
     oracledb.fetchAsString = [oracledb.CLOB];
    results = await connection.execute(query, binds, options);
    results.rows.map((r) => {
      const entries = r.ACTIVITY_JSON.split(",");
      const deserialized = {};
      entries.forEach((e) => {
        const keys = e.split(":");
        const formatKeys = keys[0].split("_");
        const name =
          formatKeys.length > 4
            ? `${formatKeys[0]}_${formatKeys[4]}`
            : formatKeys[0];
        deserialized[name] = keys[1];
      });
      r.ACTIVITY_JSON = deserialized;
    });
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
    return results;
  }
}

async function sort(direction, libraryId, assayId, pageNum, pageSize) {
  let connection;
  let results;
  try {
    let sql, binds, options, result;
    console.log(dbConfig);
    connection = await oracledb.getConnection({
      user: dbConfig.user,
      password: process.env.NODE_ORACLEDB_PASSWORD,
      connectString: dbConfig.connectString,
    });

    const skip = (pageNum <= 0 ? 0 : pageNum - 1) * pageSize;

    let query;

    if (libraryId > 0) {
      let assayProtocolId =
        "(select distinct combine_to FROM " +
        PROTOCOL_TABLE +
        " where assay_id=" +
        assayId +
        " and library_id=" +
        libraryId +
        ")";

      query =
        "select " +
        MAIN_COLUMNS +
        ", " +
        "c.* " +
        "FROM " +
        RESULT_TABLE +
        " a,  " +
        '( select COUNT(distinct sample_id) as "COUNT" FROM ' +
        DATA_TABLE +
        " where assay_protocol_id= " +
        assayProtocolId +
        " ) c, " +
        "( select sample_id FROM " +
        DATA_TABLE +
        " " +
        "where assay_protocol_id= " +
        assayProtocolId +
        " " +
        "and cov2_flag=1 " +
        "order by activity_class " +
        direction +
        ", ac50 asc " +
        "offset " +
        skip +
        " rows fetch next " +
        pageSize +
        " rows only " +
        ") x " +
        "where " +
        "a.library_id=" +
        libraryId +
        " " +
        "and " +
        "x.sample_id=a.sample_id ";
    } else {
      //libraryId=0, all collections
      const assayProtocolIdList =
        "(select distinct combine_to FROM " +
        PROTOCOL_TABLE +
        " where assay_id=" +
        assayId +
        ")";

      query =
        "select " +
        MAIN_COLUMNS +
        ", " +
        "c.* " +
        "FROM " +
        RESULT_TABLE +
        " a,  " +
        '( select COUNT(distinct sample_id) as "COUNT" FROM ' +
        DATA_TABLE +
        " where assay_protocol_id in (" +
        assayProtocolIdList +
        ") ) c, " +
        "( select sample_id FROM " +
        DATA_TABLE +
        " " +
        "where assay_protocol_id in (" +
        assayProtocolIdList +
        ") " +
        "and cov2_flag=1 " +
        "order by activity_class " +
        direction +
        ", ac50 asc " +
        "offset " +
        skip +
        " rows fetch next " +
        pageSize +
        " rows only " +
        ") x " +
        "where x.sample_id=a.sample_id ";
    }

    binds = {};
    options = {
      outFormat: oracledb.OUT_FORMAT_OBJECT, // query result format
    };
    oracledb.fetchAsString = [oracledb.CLOB];
    results = await connection.execute(query, binds, options);
    results.rows.map((r) => {
      const entries = r.ACTIVITY_JSON.split(",");
      const deserialized = {};
      entries.forEach((e) => {
        const keys = e.split(":");
        const formatKeys = keys[0].split("_");
        const name =
          formatKeys.length > 4
            ? `${formatKeys[0]}_${formatKeys[4]}`
            : formatKeys[0];
        deserialized[name] = keys[1];
      });
      r.ACTIVITY_JSON = deserialized;
    });
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
    return results;
  }
}

async function getResults(
  libraryId: number,
  pageNum: number,
  pageSize: number
) {
  let connection;
  let results;
  try {
    let sql, binds, options, result;
    console.log(dbConfig);
    connection = await oracledb.getConnection({
      user: dbConfig.user,
      password: process.env.NODE_ORACLEDB_PASSWORD,
      connectString: dbConfig.connectString,
    });

    sql = `SELECT * FROM TEST_COV2_DATA`;

    const skip = (pageNum <= 0 ? 0 : pageNum - 1) * pageSize;

    let where = ""; //libraryId=0, all collections
    if (libraryId > 0) where = "where a.library_id= " + libraryId;

    let query = `select ${MAIN_COLUMNS}, count(a.sample_id) OVER() as "COUNT" FROM ${RESULT_TABLE} a 
      ${where} 
      order by a.sample_id
      offset ${skip} rows fetch next ${pageSize} rows only`;
    console.log(query);

    binds = {};

    options = {
      outFormat: oracledb.OUT_FORMAT_OBJECT, // query result format
    };
    oracledb.fetchAsString = [oracledb.CLOB];
    results = await connection.execute(query, binds, options);

    results.rows.map((r) => {
      const entries = r.ACTIVITY_JSON.split(",");
      const deserialized = {};
      entries.forEach((e) => {
        const keys = e.split(":");
        const formatKeys = keys[0].split("_");
        const name =
          formatKeys.length > 4
            ? `${formatKeys[0]}_${formatKeys[4]}`
            : formatKeys[0];
        deserialized[name] = keys[1];
      });
      r.ACTIVITY_JSON = deserialized;
    });

    console.log("Metadata: ");
    console.log("Query results: ");
    console.dir(results.rows, { depth: null });
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
    return results;
  }
}

/*
async function run() {
  let connection;

  try {
    let sql, binds, options, result;
    console.log(dbConfig);
    connection = await oracledb.getConnection({
      user: dbConfig.user,
      password: process.env.NODE_ORACLEDB_PASSWORD,
      connectString: dbConfig.connectString,
    });

    // using sample controller:
    // https://github.com/ncats/covid19/blob/master/src/main/java/gov/nih/ncats/covid19/controller/SampleDataController.java
    // ResultDataservice implementation:
    // https://github.com/ncats/covid19/blob/master/src/main/java/gov/nih/ncats/covid19/service/internal/ResultDataServiceImpl.java
    sql = `SELECT * FROM TEST_COV2_DATA`;
    binds = {};

    // For a complete list of options see the documentation.
    options = {
      outFormat: oracledb.OUT_FORMAT_OBJECT, // query result format
    };

    result = await connection.execute(sql, binds, options);
    console.log("Metadata: ");
    console.dir(result.metaData, { depth: null });
    console.log("Query results: ");
    console.dir(result.rows, { depth: null });

    sql = `SELECT TO_CHAR(CURRENT_DATE, 'DD-Mon-YYYY HH24:MI') AS CD FROM DUAL`;
    result = await connection.execute(sql, binds, options);
    console.log("Current date query results: ");
    console.log(result.rows[0]["CD"]);
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
}
console.log("done"); */
