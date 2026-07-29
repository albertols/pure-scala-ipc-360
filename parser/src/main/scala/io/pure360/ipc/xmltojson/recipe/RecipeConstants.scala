package io.pure360.ipc.xmltojson.recipe

object RecipeConstants {

  final val Mapplet = "Mapplet"
  final val I_Mapplet = "MAPPLET"
  final val I_Source = "SOURCE"
  final val I_Target = "TARGET"
  final val SourceDefinition = "Source Definition"
  final val Filter = "Filter"
  final val InputOutput = "INPUT/OUTPUT"
  final val Return = "RETURN"
  final val Master = "MASTER"
  final val Detail = "DETAIL"
  final val Expression = "Expression"
  final val Output = "OUTPUT"
  final val Default = "DEFAULT"
  final val GeneratedColumnId = "GENERATED COLUMN ID"
  final val GeneratedKey = "GENERATED KEY"
  final val GroupBy = "GROUPBY"
  final val Primary = "PRIMARY"
  final val InputTransformation = "Input Transformation"
  final val CustomTransformation = "Custom Transformation"
  final val UnionTransformation = "Union Transformation"
  final val JavaTransformation = "Java Transformation"
  final val SourceQualifier = "Source Qualifier"
  final val SourceFilter = "Source Filter"
  final val Aggregator = "Aggregator"
  final val Joiner = "Joiner"
  final val Sequence = "Sequence"
  final val Router = "Router"
  final val Normalizer = "Normalizer"
  final val SequenceGenerator = "SequenceGenerator"
  final val LookupProcedure = "Lookup Procedure"
  final val StoredProcedure = "Stored Procedure"
  final val Input = "INPUT"
  final val LocalVariable = "LOCAL VARIABLE"
  final val FieldName = "FIELD_NAME"
  final val Undefined = "Undefined"
  final val FilterCondition = "Filter Condition"
  final val SqlQuery = "Sql Query"
  final val UserDefinedJoin = "User Defined Join"
  final val LookupCondition = "Lookup condition"
  final val LookupSourceFilter = "Lookup Source Filter"
  final val LookupSqlOverride = "Lookup Sql Override"
  final val updateOverride = "Update Override"

  final val PredefinedFunctions = List("TO_DATE", "TO_CHAR", "LPAD", "RPAD", "SUBSTR", "REPLACECHR", "TO_DECIMAL",
    "REPLACESTR", "CONCAT", "TRUNC", "TO_INTEGER", "LENGTH", "UPPER", "ISNULL", "IS_NUMBER", "INSTR", "IN", "IIF",
    "COUNT", "MAX", "MIN","GREATEST", "IS_SPACES", "DECODE", "ABS", "ADD_TO_DATE", "LAST_DAY", "SUM", "DATE_DIFF",
    "GET_DATE_PART", "IS_DATE", "CHR", "REG_MATCH", "LEAST", "REG_REPLACE")
  final val GlobalTransformationExclusionList = List("EXP_SET_ID_MIS", "EXP_SET_ID_MIS_PM")
  final val ErrorDatasetId = "DWH_CONTROL"
  final val ArithmeticOperators = List("+", "-", "*", "/")
  final val ComparisonOperators = List("<=", ">=", "<>", "!=", "^=", "=", ">", "<")
  final val LogicalOperators = List(" AND ", " and ", " OR ", " or ")
  final val StringOperators = List("||")

  // Regexps
  final val FunctionPattern = "(\\w+)\\s*\\((.*?)\\)".r
  final val CaseInsensitiveSysdate = "(?i)sysdate".r
  final val ConditionPattern = """\s*(.*?)\s*(<=|>=|<>|!=|\^=|=|>|<)\s*(.*)\s*""".r
  final val LogicalPattern = """\s*(.*?)\s*\b(AND|and|OR|or)\b\s*(.*)\s*""".r
  final val NegativePattern = """\s*(NOT)\s*(.*)""".r
  final val StringLiteralPattern =  """'(.*?)'""".r
  final val ParenthesisPattern = """\((.*)\)""".r
  final val LookupProcedurePattern = """:LKP\.(\w+)\((.*)\)""".r
  final val MappletDuplicatedPattern = ".*(_DUP|_DUPLICATED)$".r
  final val MappletValidationPattern = ".*(_VAL)$".r
  final val FilterDuplicatedConditionPattern = ".*(FLAG_DUPLICADO).*".r
  final val FilterValidationConditionPattern = ".*(LOAD_DATA).*".r
  final val FilterValidationDq1aPattern =  "^FIL(_[A-Z0-9]+)*_(OK|VAL|OUTPUT)$".r
  final val TableFieldPattern = """\b(?!\d+\.\d+\b)(\w+)\.(\w+)\b""".r
  final val FromPattern = "(?i)\\bFROM\\s+([\\w.]+(?:\\s*,\\s*[\\w.]+)*)".r
  final val JoinPattern = "(?i)\\bJOIN\\s+([\\w.]+)".r
}
