package io.pure360.ipc.scalamatica.transformation.utils

import org.slf4j.{Logger, LoggerFactory}

import java.sql.Timestamp
import java.text.SimpleDateFormat
import java.time._
import java.time.format.DateTimeFormatter
import java.util.Locale
import scala.util.Try

/**
 * Util class for date/time conversions
 */
object DateTimeUtils {

  val logger: Logger = LoggerFactory getLogger getClass.getName

  // date formats
  val TARGET_DATE_FORMAT = "yyyy-MM-dd"

  val SOURCE_DATE_FORMAT_1 = "yyyy-MM-dd"
  val SOURCE_DATE_FORMAT_2 = "yyyyMMdd"
  val SOURCE_DATE_FORMAT_3 = "dd/MM/yyyy"
  val SOURCE_DATE_FORMAT_4 = "yyyy.MM.dd"
  val SOURCE_DATE_FORMAT_5 = "dd.MM.yyyy"
  val SOURCE_DATE_FORMAT_6 = "dd-MM-yyyy"
  val SOURCE_DATE_FORMAT_7 = "ddMMyyyy"
  val SOURCE_DATE_FORMAT_8 = "yyyy/MM/dd"
  val SOURCE_DATE_FORMAT_9 = "ddMMy"

  val SOURCE_DATE_YEAR_MONTH_FORMAT = "yyyyMM"
  val SOURCE_DATE_MON_FORMAT = "dd-MMM-yyyy"
  val SOURCE_TIME_FORMAT_1 = "HH.mm.ss"
  val SOURCE_TIME_FORMAT_2 = "HH:mm:ss"

  val SOURCE_DATE_FORMATS: Seq[String] = Seq(
    SOURCE_DATE_FORMAT_1,
    SOURCE_DATE_FORMAT_2,
    SOURCE_DATE_FORMAT_3,
    SOURCE_DATE_FORMAT_4,
    SOURCE_DATE_FORMAT_5,
    SOURCE_DATE_FORMAT_6,
    SOURCE_DATE_FORMAT_7,
    SOURCE_DATE_FORMAT_9,
  )

  val REGULATORY_REPORTING_DATE_FORMATS: Seq[String] = Seq(
    SOURCE_DATE_FORMAT_1,
    SOURCE_DATE_FORMAT_2,
    SOURCE_DATE_FORMAT_3,
    SOURCE_DATE_FORMAT_4,
    SOURCE_DATE_FORMAT_5,
    SOURCE_DATE_FORMAT_6,
    SOURCE_DATE_FORMAT_7,
    SOURCE_DATE_FORMAT_8
  )

  // timestamp formats
  val TARGET_TIMESTAMP_FORMAT = "yyyy-MM-dd HH:mm:ss"
  val BIGDECIMAL_TIMESTAMP_FORMAT = "yyyyMMddHHmmss"
  val BIGDECIMAL_DATE_FORMAT = "yyyyMMdd"

  val SOURCE_TIMESTAMP_FORMAT_1 = "yyyy-MM-dd-HH.mm.ss"
  val SOURCE_TIMESTAMP_FORMAT_2 = "yyyy-MM-dd-HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_3 = "yyyy-MM-dd HH.mm.ss"
  val SOURCE_TIMESTAMP_FORMAT_4 = "yyyyMMdd HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_5 = "yyyy.MM.dd HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_6 = "yyyy.MM.dd HH.mm.ss"
  val SOURCE_TIMESTAMP_FORMAT_7 = "yyyy.MM.dd.HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_8 = "yyyy.MM.dd.HH.mm.ss"
  val SOURCE_TIMESTAMP_FORMAT_9 = "MM/dd/yyyy HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_10 = "dd/MM/yyyy HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_11 = "yyyy-MM-dd-HH.mm.ss.SSS"
  val SOURCE_TIMESTAMP_FORMAT_12 = "yyyy-MM-dd-HH.mm.ss.SSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_13 = "yyyy-MM-dd'T'HH:mm:ssXXX"
  val SOURCE_TIMESTAMP_FORMAT_14 = "yyyy-MM-dd HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_15 = "dd/MM/yyyy HH:mm:ss.SSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_16 = "yyyy/MM/dd-HH.mm.ss"
  val SOURCE_TIMESTAMP_FORMAT_17 = "yyyy/MM/dd-HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_18 = "yyyy/MM/dd HH.mm.ss"
  val SOURCE_TIMESTAMP_FORMAT_19 = "yyyy/MM/dd HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_20 = "dd-MM-yyyy HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_21 = "dd-MM-yyyy HH.mm.ss"
  val SOURCE_TIMESTAMP_FORMAT_22 = "dd-MM-yyyy-HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_23 = "dd-MM-yyyy-HH.mm.ss"
  val SOURCE_TIMESTAMP_FORMAT_24 = "dd.MM.yyyy HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_25 = "dd.MM.yyyy HH.mm.ss"
  val SOURCE_TIMESTAMP_FORMAT_26 = "dd.MM.yyyy.HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_27 = "dd.MM.yyyy.HH.mm.ss"
  val SOURCE_TIMESTAMP_FORMAT_28 = "yyyy-MM-dd-HH.mm.ss.SSSSSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_29 = "dd/MM/yyyy HH:mm:ss.SSSSSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_30 = "yyyy-MM-dd-HH.mm.ss.SSSS"
  val SOURCE_TIMESTAMP_FORMAT_31 = "yyyy-MM-dd-HH.mm.ss.SSSSS"
  val SOURCE_TIMESTAMP_FORMAT_32 = "yyyy-MM-dd-HH:mm:ss.SSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_33 = "yyyy-MM-dd-HH:mm:ss.SSSSSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_34 = "yyyy-MM-dd-HH:mm:ss.SSSS"
  val SOURCE_TIMESTAMP_FORMAT_35 = "yyyy-MM-dd-HH:mm:ss.SSSSS"
  val SOURCE_TIMESTAMP_FORMAT_36 = "yyyy-MM-dd'T'HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_37 = "dd/MM/yy HH:mm:ss,SSSSSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_38 = "dd/MM/yy HH:mm:ss:SSSSSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_39 = "dd/MM/yy HH:mm:ss"
  val SOURCE_TIMESTAMP_FORMAT_40 = "dd/MM/yy HH:mm:ss.SSSSSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_41 = "yyyy-MM-dd-HH.mm.ss.SS"
  val SOURCE_TIMESTAMP_FORMAT_42 = "yyyy-MM-dd HH:mm:ss.SSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_43 = "yyyy-MM-dd HH:mm:ss.SSSS"
  val SOURCE_TIMESTAMP_FORMAT_44 = "yyyy-MM-dd HH:mm:ss.SSSSS"
  val SOURCE_TIMESTAMP_FORMAT_45 = "yyyy-MM-dd HH:mm:ss.SSS"
  val SOURCE_TIMESTAMP_FORMAT_46 = "yyyy-MM-dd'T'HH:mm:ss'Z'"
  val SOURCE_TIMESTAMP_FORMAT_47 = "yyyy-MM-dd HH:mm:ss.SSSSSSSSS"
  val SOURCE_TIMESTAMP_FORMAT_48 = "yyyy-MM-dd HH:mm:ss.SS"
  val SOURCE_TIMESTAMP_FORMAT_49 = "yyyy-MM-dd HH:mm:ss.S"


  val TO_CHAR_DATETIME_DEFAULT_FORMAT = "MM/dd/YYYY HH:mm:ss.SSSSSS"

  val SOURCE_TIMESTAMP_FORMATS: Seq[String] = Seq(
    SOURCE_TIMESTAMP_FORMAT_1,
    SOURCE_TIMESTAMP_FORMAT_2,
    SOURCE_TIMESTAMP_FORMAT_3,
    SOURCE_TIMESTAMP_FORMAT_4,
    SOURCE_TIMESTAMP_FORMAT_5,
    SOURCE_TIMESTAMP_FORMAT_6,
    SOURCE_TIMESTAMP_FORMAT_7,
    SOURCE_TIMESTAMP_FORMAT_8,
    SOURCE_TIMESTAMP_FORMAT_9,
    SOURCE_TIMESTAMP_FORMAT_11,
    SOURCE_TIMESTAMP_FORMAT_12,
    SOURCE_TIMESTAMP_FORMAT_10,
    SOURCE_TIMESTAMP_FORMAT_36
  )

  val FILENAME_DATETIME_FORMATS = Seq(
    "DDMMYYYYHH24MMSS",
    "YYYYMMDD"
  )

  val FILENAME_DATE_PLACEHOLDER = "$$Date"

  val TIMESTAMP_BORDER_CASES = Set(
    Timestamp.valueOf("0001-01-01 00:00:00"),
    Timestamp.valueOf("0001-01-01 01:00:00"),
    Timestamp.valueOf("0001-01-01 01:01:01.000001"),
    Timestamp.valueOf("0001-01-01 00:00:00.000001")
  )

  val TIMESTAMP_BORDER_CASES_STRING = Set(
    "0001-01-01-00.00.00.000000"
  )

  final val SQL_DATE_FORMATTER = DateTimeFormatter.ofPattern(TARGET_DATE_FORMAT)
  final val SQL_DATETIME_FORMATTER = DateTimeFormatter.ofPattern(TARGET_TIMESTAMP_FORMAT)

  def bigDecimalTime: BigDecimal = BigDecimal(
    LocalDateTime.now().format(DateTimeFormatter.ofPattern(BIGDECIMAL_TIMESTAMP_FORMAT))
  )

  def bigDecimalDate: BigDecimal = BigDecimal(
    LocalDateTime.now().format(DateTimeFormatter.ofPattern(BIGDECIMAL_DATE_FORMAT))
  )

  // default values
  val DATE_DEFAULT_VALUE_INT: Int = 19000101
  val NULL_DATES: List[String] = List("00000000", "0000000000", "0", "00.00.0000", "99991231")
  val NULL_MONTHS: List[String] = List("000000", "000101", "999912", "00000", "0")

  /**
   * Converts String dateString to a Some[Timestamp] if there's any format in dateFormats that matches dateString.
   * Returns None in any other case.
   *
   * @param timestampString - Timestamp string
   * @param timestampFormats - Timestamp formats
   * @return - Optional of Timestamp
   */
  def toTimestampMultipleFormats(timestampString: String,
                                 timestampFormats: Seq[String] = SOURCE_TIMESTAMP_FORMATS): Option[Timestamp] =
    toLocalDateTimeMultipleFormats(timestampString, timestampFormats).map(Timestamp.valueOf)

  /**
   * @param dateTimeString - Date time string
   * @param dateTimeFormat - Date time format
   * @return - Option of LocalDateTime
   */
  def toLocalDateTime(dateTimeString: String, dateTimeFormat: String): Option[LocalDateTime] = {
    toLocalDateTimeMultipleFormats(dateTimeString, Seq(dateTimeFormat))
  }

  /**
   * Converts String dateString to a Some[LocalDateTime] if there's any format in dateFormats that matches dateString.
   * Returns None in any other case.
   *
   * @param dateTimeString - Date time string
   * @param dateTimeFormats - Date time formats
   * @return - Option of LocalDateTime
   */
  def toLocalDateTimeMultipleFormats(dateTimeString: String,
                                     dateTimeFormats: Seq[String] = SOURCE_TIMESTAMP_FORMATS): Option[LocalDateTime] = {
    dateTimeFormats.map { timestampFormat =>
      Try {
        LocalDateTime.parse(dateTimeString.trim, DateTimeFormatter.ofPattern(timestampFormat, Locale.ENGLISH))
      }
    }.find(_.isSuccess) match {
      case Some(value) => value.toOption
      case None =>
        logger.error(s"Couldn't cast $dateTimeString to LocalDateTime using any provided format: $dateTimeFormats")
        None
    }
  }

  def toYearMonth(dateString: String, dateFormat: String): Option[YearMonth] = {
    toYearMonthMultipleFormats(dateString, Seq(dateFormat))
  }

  /*
    * Converts String dateString to a Some[YearMonth] if there's any format in dateFormats that matches dateString.
    * Returns None in any other case.
    */
  def toYearMonthMultipleFormats(dateString: String, dateFormats: Seq[String]): Option[YearMonth] = {
    dateFormats.map { stringDateFormat =>
      Try(YearMonth.parse(dateString.trim, DateTimeFormatter.ofPattern(stringDateFormat, Locale.ENGLISH)))
    }.find(_.isSuccess) match {
      case Some(yearMonth) => Some(yearMonth.get)
      case None =>
        logger.error(s"Couldn't cast $dateString to YearMonth using any provided format: $dateFormats")
        None
    }
  }

  /*
    * Converts String dateString to a Some[LocalTime] if there's any format in dateFormats that matches dateString.
    * Returns None in any other case.
    */
  def toLocalTimeMultipleFormats(dateString: String, dateFormats: Seq[String]): Option[LocalTime] = {
    dateFormats.map { stringDateFormat =>
      Try(LocalTime.parse(dateString, DateTimeFormatter.ofPattern(stringDateFormat, Locale.ENGLISH)))
    }.find(_.isSuccess) match {
      case Some(localTime) => Some(localTime.get)
      case None =>
        logger.error(s"Couldn't cast $dateString to LocalTime using any provided format: $dateFormats")
        None
    }
  }

  def toLocalDate(dateString: String, dateFormat: String): Option[LocalDate] = {
    toLocalDateMultipleFormats(dateString, Seq(dateFormat))
  }

  /**
   * Converts String dateString to a Some[LocalDateTime] if there's any format in dateFormats that matches dateString.
   * Returns None in any other case.
   *
   * @param dateString - Date string
   * @param dateFormats - Date formats
   * @return - Option of LocalDate
   */
  def toLocalDateMultipleFormats(dateString: String,
                                 dateFormats: Seq[String] = SOURCE_DATE_FORMATS): Option[LocalDate] = {
    dateFormats.map { stringDateFormat =>
      Try(LocalDate.parse(dateString.trim, DateTimeFormatter.ofPattern(stringDateFormat, Locale.ENGLISH)))
    }
      .find(_.isSuccess) match {
      case Some(localDate) => localDate.toOption
      case None =>
        logger.error(s"Couldn't cast $dateString to LocalDate using any provided format: $dateFormats")
        None
    }
  }

  /**
   * Converts Oracle/Informatica date/time format to Scala/Spark
   *
   * @param inputFormat - Oracle/Informatica format string
   * @return - Scala format string
   */
  def convertOracleToScalaDateTimeFormat(inputFormat: String): String = {
    inputFormat
      .replaceAll("YY", "yy")
      .replace("RR", "yy") // we assume that all dates from DWH in the 21st centure
      .replace("DD", "dd")
      .replace("HH24", "HH")
      .replace("MI", "mm")
      .replace("SS", "ss")
      .replace("MS", "SSS")
      .replace("US", "SSSSSS")
      .replace("NS", "SSSSSSSSS")
  }

  /**
   * Converts Oracle date/time format to BigQuery
   *
   * @param inputFormat - Oracle format string
   * @return - BQ format string
   */
  def convertOracleToBqDateTimeFormat(inputFormat: String): String = {
    inputFormat
      .replace("YYYY", "%Y")
      .replace("MM", "%m")
      .replace("DD", "%d")
      .replace("HH24", "%H")
      .replace("HH", "%I")
      .replace("MI", "%M")
      .replace("SS", "%S")
      .replace("FF", "%f")
  }

  def currentFormattedTime(format: String) : String = LocalDateTime.now().format(DateTimeFormatter.ofPattern(format))

  /**
   * Replaces datetime placeholders with the current date/datetime
   * For output files with $$Date we take SYSDATE - 1 day, for other cases SYSDATE
   *
   * @param fileName - file name to be replaced with datetime
   * @return - replaced file name string
   */
  def replaceDateTimeFilename(fileName: String): String = {
    val today = LocalDateTime.now()
    val yesterday = today.minusDays(1)
    val withDate = fileName.replace(FILENAME_DATE_PLACEHOLDER, yesterday.format(DateTimeFormatter.ofPattern(BIGDECIMAL_DATE_FORMAT)))
    var result = withDate
    for (pattern <- FILENAME_DATETIME_FORMATS) {
      if (result.contains(pattern)) {
        val scalaFormat = convertOracleToScalaDateTimeFormat(pattern)
        val dateTimeStr = today.format(DateTimeFormatter.ofPattern(scalaFormat))
        result = result.replace(pattern, dateTimeStr)
      }
    }
    result
  }

}
