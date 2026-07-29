package io.pure360.ipc.xmltojson.sql.calcite

import org.apache.calcite.sql.util.SqlShuttle
import org.apache.calcite.sql.{SqlCall, SqlIdentifier, SqlNode}

import scala.collection.JavaConverters._

/**
 * Visitor that applies the transformations by leveraging the factory
 */
class SqlTransformerVisitor extends SqlShuttle {

  /**
   * Invokes customized transformers for some Oracle functions relying on [[SqlFunctionTransformerFactory]]
   *
   * @param call - initial function call
   * @return - customized function call
   */
  override def visit(call: SqlCall): SqlNode = {
    // Safely process the operands even if they are null
    val transformedOperands = call.getOperandList.asScala.map { operand =>
      if (operand == null) null // Preserve null values
      else operand.accept(this) // Recursively apply visitor to non-null operands
    }.asJava

    // Create a new SqlCall with transformed operands (if any)
    val transformedCall = call.getOperator.createCall(call.getParserPosition, transformedOperands)

    // Extract the name of the SQL function (upper case for consistency)
    val functionName = call.getOperator.getName.toUpperCase

    // Check the transformer factory if there's a transformer for the function
    SqlFunctionTransformerFactory.getTransformer(functionName) match {
      case Some(transformer) =>
        // Apply the transformer to the transformed call
        transformer.transform(transformedCall)
      case None =>
        // No transformer found, return the transformed call unchanged
        transformedCall
    }
  }

  /**
   * Invokes customized transformers for some Oracle functions relying on [[SqlIdentifierTransformerFactory]]
   *
   * @param identifier - initial identifier
   * @return - customized Sql node
   */
  override def visit(identifier: SqlIdentifier): SqlNode = {
    // Extract the name of the identifier
    val identifierName = identifier.getSimple.toUpperCase

    // Check the factory for a transformer for this identifier
    SqlIdentifierTransformerFactory.getTransformer(identifierName) match {
      case Some(transformer) =>
        // Apply the transformer logic
        transformer.transform(identifier)
      case None =>
        // If no transformer found, return the identifier unchanged
        super.visit(identifier)
    }
  }
}
