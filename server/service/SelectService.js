import admin from "firebase-admin";
import StringHelper from "../../app/helpers/StringHelper";
import {
  isValidDate,
  executeDateComparison
} from "../../app/helpers/DateHelper";
import FirebaseService from "./FirebaseService";

export default class SelectService {
  static getDataForSelect(
    databaseSavedData,
    collection,
    selectedFields,
    wheres,
    orderBys,
    shouldApplyListener,
    callback
  ) {
    console.log(
      "getData (collection, selectedFields, wheres):",
      collection,
      selectedFields,
      wheres
    );

    let isFirestore = databaseSavedData.firestoreEnabled;
    if (/(db|firestore)\//i.test(collection)) {
      console.log("passed regex");
      isFirestore = !isFirestore;
      collection = collection.substring(collection.indexOf("/") + 1);
    }
    console.log("collection after:", collection);

    const app = FirebaseService.startFirebaseApp(databaseSavedData);
    let db = isFirestore ? app.firestore() : app.database();

    //TODO: reimplement listeners, using firestore listeners as well
    let results = {
      statementType: "SELECT_STATEMENT",
      path: collection,
      orderBys: orderBys,
      payload: {}
    };
    if (
      !wheres ||
      (wheres[0] && wheres[0] && wheres[0].error === "NO_EQUALITY_STATEMENTS")
    ) {
      //unfilterable query, grab whole collection
      const args = [
        db,
        collection,
        selectedFields,
        results,
        shouldApplyListener,
        res => {
          if (wheres && wheres[0]) {
            res.payload = this.filterWheresAndNonSelectedFields(
              res.payload,
              wheres,
              selectedFields
            );
            // results.firebaseListener = ref;
          }
          return callback(res);
        }
      ];
      if (isFirestore) {
        this.queryEntireFirestoreCollection(...args);
      } else {
        this.queryEntireRealtimeCollection(...args);
      }
    } else {
      //filterable query
      if (isFirestore) {
        this.executeFilteredFirestoreQuery(results, db,...arguments);
      } else {
        this.executeFilteredRealtimeQuery(results, db, ...arguments);
      }
    }
  }

  static queryEntireFirestoreCollection(
    db,
    collection,
    selectedFields,
    results,
    shouldApplyListener,
    callback
  ) {
    console.log("NON_FILTERABLE_FIRESTORE_QUERY");

    //TODO: figure out a way to make this a listener
    db
      .collection(collection)
      .get()
      .then(querySnapshot => {
        querySnapshot.forEach(function(doc) {
          results.payload[doc.id] = doc.data();
        });
        if (selectedFields) {
          results.payload = this.removeNonSelectedFieldsFromResults(
            results.payload,
            selectedFields
          );
        }
        return callback(results);
      });
  }

  static queryEntireRealtimeCollection(
    db,
    collection,
    selectedFields,
    results,
    shouldApplyListener,
    callback
  ) {
    console.log("NON_FILTERED_REALTIME_QUERY");
    console.log("collection:", collection);

    let ref = db.ref(collection);
    ref[shouldApplyListener ? "on" : "once"]("value", snapshot => {
      results.payload = snapshot.val();
      if (selectedFields) {
        results.payload = this.removeNonSelectedFieldsFromResults(
          results.payload,
          selectedFields
        );
      }
      results.firebaseListener = {
        unsubscribe: ()=>ref.off("value"),
        type: "realtime"
      };
      return callback(results);
    });
  }

  static executeFilteredFirestoreQuery(
    results,
    db,
    databaseSavedData,
    collection,
    selectedFields,
    wheres,
    orderBys,
    shouldApplyListener,
    callback
  ) {
    console.log("FILTERED_FIRESTORE");
    const mainWhere = wheres[0];
    let unsub = db
      .collection(collection)
      .where(mainWhere.field, mainWhere.comparator, mainWhere.value)
      .onSnapshot(snapshot => {
        let payload = {};
        snapshot.forEach(doc => {
          payload[doc.id] = doc.data();
        });
        payload = this.filterWheresAndNonSelectedFields(
          payload,
          wheres,
          selectedFields
        );

        results.payload = payload;
        results.firebaseListener = {
          type: "firestore",
          unsubscribe: ()=> unsub()
        };

        // console.log("onSnap:", onSnap);

        callback(results);
      });
  }

  static executeFilteredRealtimeQuery(
    results,
    db,
    databaseSavedData,    
    collection,
    selectedFields,
    wheres,
    orderBys,
    shouldApplyListener,
    callback
  ) {
    console.log("FILTERED_REALTIME");

    const mainWhere = wheres[0];
    let ref = db.ref(collection);
    ref
      .orderByChild(mainWhere.field)
      .equalTo(mainWhere.value)
      .on("value", snapshot => {
        results.payload = this.filterWheresAndNonSelectedFields(
          snapshot.val(),
          wheres,
          selectedFields
        );
        console.log("select results: ", results);
        results.firebaseListener = {
          unsubscribe: ()=>ref.off("value"),
          type: "realtime"
        };
        return callback(results);
      });
  }

  static filterWheresAndNonSelectedFields(
    resultsPayload,
    wheres,
    selectedFields
  ) {
    if (wheres.length > 1) {
      resultsPayload = this.filterResultsByWhereStatements(
        resultsPayload,
        wheres.slice(1)
      );
    }
    if (selectedFields) {
      resultsPayload = this.removeNonSelectedFieldsFromResults(
        resultsPayload,
        selectedFields
      );
    }
    return resultsPayload;
  }

  static removeNonSelectedFieldsFromResults(results, selectedFields) {
    if (!results || !selectedFields) {
      return results;
    }
    Object.keys(results).forEach((objKey, index) => {
      if (typeof results[objKey] !== "object") {
        if (!selectedFields[objKey]) {
          delete results[objKey];
        }
      } else {
        Object.keys(results[objKey]).forEach((propKey, index) => {
          if (!selectedFields[propKey]) {
            delete results[objKey][propKey];
          }
        });
      }
    });
    return Object.keys(results).length === 1
      ? results[Object.keys(results)[0]]
      : results;
  }

  static filterResultsByWhereStatements(results, whereStatements) {
    if (!results) {
      return null;
    }
    let returnedResults = {};
    let nonMatch = {};
    for (let i = 0; i < whereStatements.length; i++) {
      let indexOffset = 1;
      let where = whereStatements[i];
      const that = this;
      Object.keys(results).forEach(function(key, index) {
        let thisResult = results[key][where.field];
        if (!that.conditionIsTrue(thisResult, where.value, where.comparator)) {
          nonMatch[key] = results[key];
        }
      });
    }
    if (nonMatch) {
      Object.keys(results).forEach(function(key, index) {
        if (!nonMatch[key]) {
          returnedResults[key] = results[key];
        }
      });
      return returnedResults;
    } else {
      return results;
    }
  }

  static conditionIsTrue(val1, val2, comparator) {
    switch (comparator) {
      case "==":
        return this.determineEquals(val1, val2);
      case "!=":
        return !this.determineEquals(val1, val2);
      case "<=":
      case "<":
      case ">=":
      case ">":
        return this.determineGreaterOrLess(val1, val2, comparator);
      case "like":
        return StringHelper.determineStringIsLike(val1, val2);
      case "!like":
        return !StringHelper.determineStringIsLike(val1, val2);
      default:
        throw "Unrecognized comparator: " + comparator;
    }
  }

  static determineEquals(val1, val2) {
    val1 = typeof val1 == "undefined" || val1 == "null" ? null : val1;
    val2 = typeof val2 == "undefined" || val2 == "null" ? null : val2;
    return val1 === val2;
  }

  static determineGreaterOrLess(val1, val2, comparator) {
    let isNum = false;
    if (isNaN(val1) || isNaN(val2)) {
      if (isValidDate(val1) && isValidDate(val2)) {
        return executeDateComparison(val1, val2, comparator);
      }
    } else {
      isNum = true;
    }
    switch (comparator) {
      case "<=":
        return isNum ? val1 <= val2 : val1.length <= val2.length;
      case ">=":
        return isNum ? val1 >= val2 : val1.length >= val2.length;
      case ">":
        return isNum ? val1 > val2 : val1.length < val2.length;
      case "<":
        return isNum ? val1 < val2 : val1.length < val2.length;
    }
  }
}
