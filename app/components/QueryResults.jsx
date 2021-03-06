import React from "react";
import PropTypes from "prop-types";
import ReactTooltip from "react-tooltip";

import { formatDate } from "../helpers/DateHelper";
import StringHelper from "../helpers/StringHelper";
import ObjectTree from "./object_tree/ObjectTree";

const QueryResults = props => {
  const store = props.store;
  return (
    <div className="objectTree-container">
      <div className="results-header">
        <h4>
          {renderResultsTitle(props.payloadSize, store.results)}
        </h4>
        <ReactTooltip id="expandTooltip" type="dark" effect="solid" place="top">
          {props.resultsOpen ? "Collapse results" : "Expand results"}
        </ReactTooltip>
        <i
          data-tip
          data-for="expandTooltip"
          className={
            "fa fa-" +
            (props.resultsOpen ? "minus" : "plus") +
            "-square-o gray-icon"
          }
          onClick={e => {
            props.setWorkstationState("resultsOpen", !props.resultsOpen);
          }}
        />
      </div>
      {props.payloadSize > 0 &&
        props.store.results.payload != null &&
        <ObjectTree value={props.store.results} level={2} {...props} />}
    </div>
  );
};

const renderResultsTitle = (payloadSize, results) => {
  let payloadDescription =
    payloadSize > 50 ? "Displaying 50 of " + payloadSize : payloadSize;
  switch (results.statementType) {
    case "UPDATE_STATEMENT":
      return (
        <span>
          Updated Records ({payloadDescription}):
        </span>
      );
    case "INSERT_STATEMENT":
      let numInserted = results.insertCount > 1 ? " (" + results.insertCount + "): " : ": ";
      return "Inserted Records" + numInserted;
    case "DELETE_STATEMENT":
      return (
        <span>
          Records to Delete ({payloadDescription}):
        </span>
      );
    default:
      return (
        <span>
          {results.path} ({payloadDescription}):
        </span>
      );
  }
};

QueryResults.propTypes = {
  resultsOpen: PropTypes.bool,
  payloadSize: PropTypes.number,
  store: PropTypes.object.isRequired
};

export default QueryResults;
