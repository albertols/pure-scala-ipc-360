package io.pure360.ipc.utils.dir

import org.slf4j.{Logger, LoggerFactory}

import java.io.File
import scala.util.{Failure, Success, Try}

object ScalaFileUtils {

  val log: Logger = LoggerFactory getLogger getClass.getName

  def createDir(directoryPath: String): Unit = {
    val directory = new File(directoryPath)
    if (!directory.exists())
      Try(directory.mkdir()) match {
        case Success(s) => log.info(s"Directory '$directoryPath' created successfully.")
        case Failure(f) => log.info(s"Failed to create directory '$directoryPath'.")
      }
    else log.info(s"Directory '$directoryPath' already exists.")
  }

  def relativeResourcePath(resourcePath: String): String =
    Try(getClass.getResource(resourcePath)) match {
      case Success(url) =>
        val file = new File(url.toURI)
        log.info(s"File path: ${file.getAbsolutePath}")
        file.getAbsolutePath
      case Failure(f) => throw new IllegalArgumentException(s"could not find $resourcePath", f)
    }

  def getFileNameWithoutExtension(file: File): String =
    if (file.exists()) {
      val fileNameWithExtension = file.getName
      val lastDotIndex = fileNameWithExtension.lastIndexOf(".")
      lastDotIndex match {
        case greater if greater > 0 =>
          val fileNameWithoutExtension = fileNameWithExtension.substring(0, lastDotIndex)
          log.info(s"File name without extension: $fileNameWithoutExtension")
          fileNameWithoutExtension
        case _ => throw new RuntimeException(s"File ${file.getAbsolutePath} has no extension.")
      }
    } else throw new RuntimeException(s"File '$file' does not exist.")

  def getAbsoluteFileFromRelative(relativeFilePath: String): File = {
    val currentDirectory = new java.io.File(".").getCanonicalPath
    log.info(s"currentDirectory=$currentDirectory")
    val newFileAbsolutePath = s"$currentDirectory/$relativeFilePath"
    new File(newFileAbsolutePath) match {
      case notNull if null != notNull =>
        log.info(s"File path: ${notNull.getAbsolutePath}")
        notNull
      case null => throw new IllegalArgumentException(s"could not find $relativeFilePath=null")
    }
  }

  def getAllFilesWithExtension(directoryPath: String, extension: String): List[File] = {
    val directory = new File(directoryPath)
    if (directory.exists && directory.isDirectory) {
      val fileList = directory.listFiles
      val matchingFiles = fileList.collect {
        case file if file.isFile && (file.getName.endsWith(extension) || file.getName.toLowerCase.endsWith(extension.toLowerCase())) => file
      }
      val subdirectoryFiles = fileList.collect {
        case subDir if subDir.isDirectory =>
          getAllFilesWithExtension(subDir.getAbsolutePath, extension)
      }.flatten.toList
      matchingFiles ++ subdirectoryFiles
    }.toList else {
      Nil
    }
  }

  /**
   * This method is used to remove the spaces in between from the file paths
   * Ex:src\main\resources\xmltobq\EXAMPLE_MAPPING_123_1\ODS\ m_ODS _F_EXAMPLE_UNIT\ _ETL_m_ODS _F_EXAMPLE_UNIT.json
   *
   * @param inputStr - input string
   * @return updated string
   */
  def removeSpacesFromFilePath(inputStr: String): String =
    if (inputStr == null || inputStr.trim.isEmpty) null else inputStr.trim.replaceAll("\\s+", "")

}
