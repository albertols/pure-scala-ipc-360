package io.pure360.ipc.model.recipe

import io.pure360.ipc.xmltojson.nodes.Folder.Folder
import io.pure360.ipc.xmltojson.nodes.Mappable
import io.pure360.ipc.xmltojson.nodes.Mapplet.Instance

case class InstanceCursor (folder: Folder, mappable: Mappable, instance: Instance)
