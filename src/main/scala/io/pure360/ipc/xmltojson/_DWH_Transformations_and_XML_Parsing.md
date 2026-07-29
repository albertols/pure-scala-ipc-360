# Informatica PowerCenter Transformations and XML Parsing

- [Terms](#terms)
- [Engine](#engine)
    - [XML Parsing Algorithm](#xml-parsing-algorithm)
        - [Version 1. STG→ODS](#version-1-stgods)
        - [Version 2. ODS→ETL](#version-2-odsetl)
    - [Steps transformations (Version 2 only)](#steps-transformations-version-2-only)
        - [Target table](#target-table)
        - [Source table](#source-table)
        - [Union](#union)
        - [SourceQualifier](#sourcequalifier)
        - [Filter](#filter)
        - [Joiner](#joiner)
        - [Aggregator](#aggregator)
        - [Router](#router)
        - [Normalizer](#normalizer)
        - [Java](#java)
        - [Lookups (Version 2 only)](#lookups-version-2-only)
        - [Global transformations (Version 1, Version 2 - TBC)](#global-transformations-version-1-version-2---tbc)
        - [Simple transformations - expressions (Version 1, Version 2 - TBC)](#simple-transformations---expressions-version-1-version-2---tbc)
        - [Sequence Generator](#sequence-generator)
    - [Transformations engine (Version 1)](#transformations-engine-version-1)
        - [General overview](#general-overview)

# Terms

**Transformation** - according to the
[Informatica Developer Transformation Guide](https://docs.informatica.com/data-quality-and-governance/informatica-data-quality/10-5/developer-transformation-guide/introduction-to-transformations.html)

**Global transformation** - a transformation, which encapsulates some reusable validation and/or ETL logic and is
defined on global (folder) level. These transformations can be instantiated by name from mappings and mapplets.

**Validation** - a transformation, which is used for DQ1a/DQ1b quality control. It can generate an error, which flows
into a control error table with DQ related info. Typically validations are applied in the STG → ODS layer.

**Expression** - a statement in the SQL-like
[Informatica transformation language](https://docs.informatica.com/data-quality-and-governance/informatica-data-quality/10-5/transformation-language-reference/the-transformation-language.html)

---

# Engine

## XML Parsing Algorithm

**Version 1. STG→ODS**

The engine processes an Informatica XML-based configuration file and walks backwards from a target field to a
corresponding source field, if it exists. This is performed for each target field in a loop.

**Version 2. ODS→ETL**

We assume that some filter/query/narrow/union operations can be performed only on row/record/table level. For this
reason such intermediate states are presented in the generated ETL Recipe as explicit steps (target/sources pairs).

---

<h3> Steps transformations (Version 2 only)</h3>
<p>There are the list of transformations, which signal about step start/end:</p>
<table class="wrapped"><colgroup><col style="width: 115.0px;" /><col style="width: 104.0px;" /><col style="width: 707.0px;" /><col style="width: 306.0px;" /><col style="width: 92.0px;" /><col style="width: 473.0px;" /></colgroup>
<tbody>
<tr>
<th>Name</th>
<th colspan="1">Attributes to recipe</th>
<th>Target recipe example</th>
<th>Source recipe example</th>
<th colspan="1">Comments</th>
<th colspan="1">Informatica example</th></tr>
<tr>
<td>Target table</td>
<td colspan="1">
<p><u>Target</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;table&quot;</p>
<p><strong>fields</strong></p></td>
<td>
<div class="content-wrapper">
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />  <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;DWH_E_D_BIENES_PO&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;table&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_ENTIDAD&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;String&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;UN_DWH_E_D_BIENES_PO.CDEMPRES&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_CODIGO_SERVICIO&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;String&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;UN_DWH_E_D_BIENES_PO.CODISER&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },</pre>
<p><br /></p></div></td>
<td>N/A</td>
<td colspan="1"><span style="color: rgb(255,0,0);">Primary keys?</span></td>
<td colspan="1"><em>screenshot not exported</em></td></tr>
<tr>
<td colspan="1">Source table</td>
<td colspan="1">
<p><u>Source</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;table&quot;</p></td>
<td colspan="1">N/A</td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;sources&quot; </span>: [<br />  {<br />    <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ODS_PO_07_INMUEBLES&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;table&quot;<br /></span><span style="color: rgb(6,125,23);">  </span>}<br />]</pre></td>
<td colspan="1"><br /></td>
<td colspan="1">
<div class="content-wrapper">
<p><em>screenshot not exported</em></p></div></td></tr>
<tr>
<td>Union</td>
<td colspan="1">
<p><u><span style="color: rgb(0,51,102);">Target</span></u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;unionInput&quot;</p>
<p><strong>fields</strong></p>
<p><br /></p>
<p><u>Source</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;union&quot;</p>
<p><strong>unionTables</strong>: Input1_name, Input2_name</p></td>
<td>
<div class="content-wrapper">
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />  <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;VEHICULOS&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;unionInput&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;CDEMPRES1&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;String&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;SQ_ODS_PO_06_VEHICULOS.CDEMPRES&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;CODISER1&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;String&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;SQ_ODS_PO_06_VEHICULOS.CODISER&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },<br />...<br />}<br /><br /></pre>
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />  <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;SQ_ODS_PO_07_INMUEBLES&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;sourceQualifier&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;selectDistinct&quot; </span>: <span style="color: rgb(0,51,179);">false</span>,<br />  <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_RECORD&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;BigDecimal&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ODS_PO_07_INMUEBLES.ID_RECORD&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;FCH_DATOS&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;BigDecimal&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ODS_PO_07_INMUEBLES.FCH_DATOS&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },<br />...<br />}</pre></div></td>
<td>
<div class="content-wrapper">
<pre><span style="color: rgb(199,125,187);">&quot;sources&quot; </span>: [<br />  {<br />    <span style="color: rgb(199,125,187);">&quot;name&quot; </span>: <span style="color: rgb(106,171,115);">&quot;UN_DWH_E_D_BIENES_PO&quot;</span>,<br />    <span style="color: rgb(199,125,187);">&quot;type&quot; </span>: <span style="color: rgb(106,171,115);">&quot;union&quot;</span>,<br />    <span style="color: rgb(199,125,187);">&quot;unionTables&quot; </span>: [<br />      {<br />        <span style="color: rgb(199,125,187);">&quot;name&quot; </span>: <span style="color: rgb(106,171,115);">&quot;VEHICULOS&quot;</span>,<br />        <span style="color: rgb(199,125,187);">&quot;fieldMapping&quot; </span>: [<br />          {<br />            <span style="color: rgb(199,125,187);">&quot;origin&quot; </span>: <span style="color: rgb(106,171,115);">&quot;CDEMPRES1&quot;</span>,<br />            <span style="color: rgb(199,125,187);">&quot;union&quot; </span>: <span style="color: rgb(106,171,115);">&quot;CDEMPRES&quot;<br /></span><span style="color: rgb(106,171,115);">          </span>},<br />          {<br />            <span style="color: rgb(199,125,187);">&quot;origin&quot; </span>: <span style="color: rgb(106,171,115);">&quot;CODISER1&quot;</span>,<br />            <span style="color: rgb(199,125,187);">&quot;union&quot; </span>: <span style="color: rgb(106,171,115);">&quot;CODISER&quot;<br /></span><span style="color: rgb(106,171,115);">          </span>},<br />          {<br />            <span style="color: rgb(199,125,187);">&quot;origin&quot; </span>: <span style="color: rgb(106,171,115);">&quot;NUPROPU1&quot;</span>,<br />            <span style="color: rgb(199,125,187);">&quot;union&quot; </span>: <span style="color: rgb(106,171,115);">&quot;NUPROPU&quot;<br /></span><span style="color: rgb(106,171,115);">          </span>},<br />...<br />    </pre>
<pre>,<br />     {<br />       <span style="color: rgb(199,125,187);">&quot;name&quot; </span>: <span style="color: rgb(106,171,115);">&quot;INMUEBLES&quot;</span>,<br />       <span style="color: rgb(199,125,187);">&quot;fieldMapping&quot; </span>: [<br />         {<br />           <span style="color: rgb(199,125,187);">&quot;origin&quot; </span>: <span style="color: rgb(106,171,115);">&quot;CDEMPRES2&quot;</span>,<br />           <span style="color: rgb(199,125,187);">&quot;union&quot; </span>: <span style="color: rgb(106,171,115);">&quot;CDEMPRES&quot;<br /></span><span style="color: rgb(106,171,115);">         </span>},<br />         {<br />           <span style="color: rgb(199,125,187);">&quot;origin&quot; </span>: <span style="color: rgb(106,171,115);">&quot;CODISER2&quot;</span>,<br />           <span style="color: rgb(199,125,187);">&quot;union&quot; </span>: <span style="color: rgb(106,171,115);">&quot;CODISER&quot;<br /></span><span style="color: rgb(106,171,115);">         </span>},<br />         {<br />           <span style="color: rgb(199,125,187);">&quot;origin&quot; </span>: <span style="color: rgb(106,171,115);">&quot;NUPROPU2&quot;</span>,<br />           <span style="color: rgb(199,125,187);">&quot;union&quot; </span>: <span style="color: rgb(106,171,115);">&quot;NUPROPU&quot;<br /></span><span style="color: rgb(106,171,115);">         </span>},<br />...<br />    ]<br />  }<br />]</pre></div></td>
<td colspan="1"><br /></td>
<td colspan="1">
<div class="content-wrapper">
<p><em>screenshot not exported</em></p></div></td></tr>
<tr>
<td>SourceQualifier</td>
<td colspan="1">
<p><u>Target</u></p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;sourceQualifier&quot;</p>
<p><strong>sourceFilter</strong></p>
<p><strong>sqlQuery</strong></p>
<p><strong>userDefinedJoin</strong></p>
<p><strong>selectDistincts</strong></p>
<p><strong>fields</strong></p>
<p><br /></p>
<p><u>Source</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;sourceQualifier&quot;</p></td>
<td>
<div class="content-wrapper">
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />  <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;SQ_ODS_F_VA_MOVIMIENTOS&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;sourceQualifier&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;userDefinedJoin&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ODS_F_VA_EMISION_VAL.ID_COD_VALOR = TO_NUMBER(SUBSTR(ODS_F_VA_MOVIMIENTOS.ID_VALOR,1,9))<br /></span><span style="color: rgb(6,125,23);">AND </span><span style="color: rgb(6,125,23);">ODS_F_VA_EMISION_VAL.ID_SERIE_VALOR = SUBSTR(ODS_F_VA_MOVIMIENTOS.ID_VALOR,10,2)&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;selectDistinct&quot; </span>: <span style="color: rgb(0,51,179);">false</span>,<br />  <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_RECORD&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;BigDecimal&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ODS_F_VA_MOVIMIENTOS.ID_RECORD&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },<br />...<br />}</pre></div></td>
<td>
<div class="content-wrapper">
<pre><span style="color: rgb(135,16,148);">&quot;sources&quot; </span>: [<br />  {<br />    <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;SQ_ODS_F_VA_MOVIMIENTOS&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;sourceQualifier&quot;<br /></span><span style="color: rgb(6,125,23);">  </span>}<br />]</pre>
<p><br /></p></div></td>
<td colspan="1">TBD: Add multiple source tables</td>
<td colspan="1">
<div class="content-wrapper">
<p><em>screenshot not exported</em></p></div></td></tr>
<tr>
<td colspan="1">Filter</td>
<td colspan="1">
<p><u>Target</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;filter&quot;</p>
<p><strong>filterCondition</strong></p>
<p><strong>fields</strong></p>
<p><br /></p>
<p><u>Source</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;filter&quot;</p></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />  <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;FILTRANS&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;filter&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;filterCondition&quot; </span>: {<br />     <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;EXP_COMPARISON&quot;</span>,<br />     <span style="color: rgb(135,16,148);">&quot;parameters&quot; </span>: [<br />       {<br />         <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_SCORE&quot;<br /></span><span style="color: rgb(6,125,23);">       </span>},<br />       {<br />         <span style="color: rgb(135,16,148);">&quot;value&quot; </span>: <span style="color: rgb(6,125,23);">&quot;&gt;&quot;<br /></span><span style="color: rgb(6,125,23);">       </span>},<br />       {<br />         <span style="color: rgb(135,16,148);">&quot;value&quot; </span>: <span style="color: rgb(6,125,23);">&quot;0&quot;<br /></span><span style="color: rgb(6,125,23);">       </span>}<br />     ]<br />   },<br /><span style="color: rgb(135,16,148);">   &quot;fields&quot; </span>: [<br />     {<br /><span style="color: rgb(135,16,148);">       &quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_SCORE&quot;</span>,<br /><span style="color: rgb(135,16,148);">       &quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;BigDecimal&quot;</span>,<br /><span style="color: rgb(135,16,148);">       &quot;transformation&quot; </span>: {<br /><span style="color: rgb(135,16,148);">          &quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;SQ_CHECK_INFORMATION.ID_SCORE&quot;<br /></span><span style="color: rgb(6,125,23);">        </span>}<br />     }<br />  ]<br />},</pre></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;sources&quot; </span>: [<br />  {<br />    <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;FILTRANS&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;filter&quot;<br /></span><span style="color: rgb(6,125,23);">  </span>}<br />]</pre></td>
<td colspan="1"><br /></td>
<td colspan="1">
<div class="content-wrapper">
<p><em>screenshot not exported</em></p></div></td></tr>
<tr>
<td colspan="1">Joiner</td>
<td colspan="1">
<p><u>Target</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;joinerInput&quot;</p>
<p><strong>fields</strong></p>
<p><br /></p>
<p><u>Source</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;joiner&quot;</p>
<p><strong>joinerTables</strong>: MasterName, DetailName</p>
<p><strong>joinerType</strong>: Normal, Matser Outer, etc.</p>
<p><strong>joinerCondition</strong></p></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />  <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;JNR_MJ_EMISION_VAL_INTRUMENTOS.MASTER&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;joinerInput&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_SP_RATING&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;String&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;AGG_FCH_ALTA_MAX.ID_SP_RATING&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },<br />...<br />}<br /><br /></pre>
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />  <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;JNR_MJ_EMISION_VAL_INTRUMENTOS.DETAIL&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;joinerInput&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_COD_VALOR&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;BigDecimal&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;JNR_MJ_EMISION_VAL_INSTRUMENTOS.ID_COD_VALOR&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },<br />...<br />}</pre></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;sources&quot; </span>: [<br />  {<br />    <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;JNR_MJ_EMISION_VAL_INTRUMENTOS&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;joiner&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;joinerTables&quot; </span>: [<br />      <span style="color: rgb(6,125,23);">&quot;JNR_MJ_EMISION_VAL_INTRUMENTOS.MASTER&quot;</span>,<br />      <span style="color: rgb(6,125,23);">&quot;JNR_MJ_EMISION_VAL_INTRUMENTOS.DETAIL&quot;<br /></span><span style="color: rgb(6,125,23);">    </span>],<br />    <span style="color: rgb(135,16,148);">&quot;joinerType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;Master Outer Join&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;joinerCondition&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_INSTRUMENTO = ID_INSTRUMENTO_ventidad&quot;<br /></span><span style="color: rgb(6,125,23);">  </span>}<br />]</pre></td>
<td colspan="1"><br /></td>
<td colspan="1">
<div class="content-wrapper">
<p><em>screenshot not exported</em></p></div></td></tr>
<tr>
<td colspan="1">Aggregator</td>
<td colspan="1">
<p><u>Target</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;aggregator&quot;</p>
<p><strong>groupByFields</strong></p>
<p><strong>fields</strong></p>
<p><br /></p>
<p><u>Source</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;aggregator&quot;</p></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />  <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;AGG_FCH_ALTA_MAX&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;aggregator&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;groupByFields&quot; </span>: [<br />    <span style="color: rgb(6,125,23);">&quot;ID_INSTRUMENTO&quot;<br /></span><span style="color: rgb(6,125,23);">  </span>],<br />  <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_INSTRUMENTO&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;String&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;SQ_ODS_TUA_01_INSTRUMENTOS.ID_INSTRUMENTO&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },<br />....<br />}</pre></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;sources&quot; </span>: [<br />  {<br />    <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;AGG_FCH_ALTA_MAX&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;aggregator&quot;<br /></span><span style="color: rgb(6,125,23);">  </span>}<br />]</pre></td>
<td colspan="1"><br /></td>
<td colspan="1">
<div class="content-wrapper">
<p><em>screenshot not exported</em></p></div></td></tr>
<tr>
<td colspan="1">Router</td>
<td colspan="1">
<p><u>Target</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;router&quot;</p>
<p><strong>groups </strong>- output groups with filterCondition, output fields and default parameter</p>
<p><strong>fields</strong></p>
<p><br /></p>
<p><u>Source</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;router&quot;</p></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />  <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;RTR_CODIGO_SERVICIO&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;router&quot;</span>,<br />  <span style="color: rgb(135,16,148);">&quot;groups&quot; </span>: [<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;AF&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;filterCondition&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_CODIGO_SERVICIO='AF'&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;default&quot; </span>: <span style="color: rgb(0,51,179);">false</span>,<br />      <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />        {<br />          <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_OPERACION1&quot;</span>,<br />          <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;String&quot;</span>,<br />          <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />            <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;RTR_CODIGO_SERVICIO.ID_OPERACION&quot;<br /></span><span style="color: rgb(6,125,23);">          </span>}<br />        },<br />        ....<br />      ]</pre>
<pre>    },<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;DEFAULT1&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;default&quot; </span>: <span style="color: rgb(0,51,179);">true</span>,<br />      <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />        {<br />          <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_OPERACION2&quot;</span>,<br />          <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;String&quot;</span>,<br />          <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />            <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;RTR_CODIGO_SERVICIO.ID_OPERACION&quot;<br /></span><span style="color: rgb(6,125,23);">          </span>}<br />        },<br />        ....<br />      ]<br />    },<br />    ....<br />  ],<br />  <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />    {<br />      <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_OPERACION&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;String&quot;</span>,<br />      <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />        <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;FIL_EXISTS.ID_OPERACION&quot;<br /></span><span style="color: rgb(6,125,23);">      </span>}<br />    },<br />    ....<br />  ]</pre>
<pre>}<br /><br /></pre></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;sources&quot; </span>: [<br />  {<br />    <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;RTR_CODIGO_SERVICIO&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;router&quot;<br /></span><span style="color: rgb(6,125,23);">  </span>}<br />]</pre></td>
<td colspan="1"><br /></td>
<td colspan="1">
<div class="content-wrapper">
<p><em>screenshot not exported</em></p></div></td></tr>
<tr>
<td colspan="1">Normalizer</td>
<td colspan="1">
<p><u>Target</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;normalizer&quot;</p>
<p><strong><span style="color: rgb(0,0,0);">normalizedFields</span></strong><span style="color: rgb(0,0,0);">  - list of normalized fields with refSource list, generatedColumnId, generatedKey parameters</span></p>
<p><strong>fields</strong></p>
<p><br /></p>
<p><br /></p>
<p><u>Source</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;normalizer&quot;</p></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />    <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;NRMTRANS&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;normalizer&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;normalizedFields&quot; </span>: [<br />      {<br />        <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_OBJETIVOS_INVERSION&quot;</span>,<br />        <span style="color: rgb(135,16,148);">&quot;refSource&quot; </span>: [<br />          <span style="color: rgb(6,125,23);">&quot;ID_OBJETIVOS_INVERSION_in&quot;<br /></span><span style="color: rgb(6,125,23);">        </span>],<br />        <span style="color: rgb(135,16,148);">&quot;generatedColumnId&quot; </span>: <span style="color: rgb(0,51,179);">false</span>,<br />        <span style="color: rgb(135,16,148);">&quot;generatedKey&quot; </span>: <span style="color: rgb(0,51,179);">false<br /></span><span style="color: rgb(0,51,179);">      </span>},<br />      ....      </pre>
<pre>      {<br />        <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_PREGUNTA_OI&quot;</span>,<br />        <span style="color: rgb(135,16,148);">&quot;refSource&quot; </span>: [<br />           <span style="color: rgb(6,125,23);">&quot;ID_PREGUNTA_OI_in1&quot;</span>,<br />           <span style="color: rgb(6,125,23);">&quot;ID_PREGUNTA_OI_in2&quot;</span>,<br />           ....<br />           <span style="color: rgb(6,125,23);">&quot;ID_PREGUNTA_OI_in34&quot;<br /></span><span style="color: rgb(6,125,23);">         </span>],<br />        <span style="color: rgb(135,16,148);">&quot;generatedColumnId&quot; </span>: <span style="color: rgb(0,51,179);">false</span>,<br />        <span style="color: rgb(135,16,148);">&quot;generatedKey&quot; </span>: <span style="color: rgb(0,51,179);">false<br /></span>      },<br />     ....     </pre>
<pre>     {<br />        <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;GCID_ID_PREGUNTA_OI&quot;</span>,<br />        <span style="color: rgb(135,16,148);">&quot;refSource&quot; </span>: [<br />          <span style="color: rgb(6,125,23);">&quot;ID_PREGUNTA_OI&quot;<br /></span><span style="color: rgb(6,125,23);">         </span>],<br />        <span style="color: rgb(135,16,148);">&quot;generatedColumnId&quot; </span>: <span style="color: rgb(0,51,179);">true</span>,<br />       <span style="color: rgb(135,16,148);">&quot;generatedKey&quot; </span>: <span style="color: rgb(0,51,179);">false<br /></span>     }<br />   ],<br />   <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />     {<br />       <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_OBJETIVOS_INVERSION_in&quot;</span>,<br />       <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;String&quot;</span>,<br />       <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />         <span style="color: rgb(135,16,148);">&quot;source&quot; </span>: <span style="color: rgb(6,125,23);">&quot;JNRTRANS.ID_OBJETIVOS_INVERSION&quot;<br /></span><span style="color: rgb(6,125,23);">       </span>} <br />     },<br />    ....<br />   ]<br />}</pre></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;sources&quot; </span>: [<br />  {<br />    <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;NRMTRANS&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;normalizer&quot;<br /></span><span style="color: rgb(6,125,23);">  </span>}<br />]</pre></td>
<td colspan="1"><br /></td>
<td colspan="1">
<div class="content-wrapper">
<p><em>screenshot not exported</em></p></div></td></tr>
<tr>
<td colspan="1">Java</td>
<td colspan="1">
<p><u>Target</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;java&quot;</p>
<p><span style="color: rgb(0,0,0);"><strong>javaCode</strong></span></p>
<p><strong>fields</strong></p>
<p><br /></p>
<p><br /></p>
<p><u>Source</u>:</p>
<p><strong>name</strong></p>
<p><strong>type</strong>: &quot;java&quot;</p></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;target&quot; </span>: {<br />    <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;JV_tx&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;java&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;javaCode&quot; </span>: <span style="color: rgb(6,125,23);">&quot;// java code snippet</span><span style="color: rgb(6,125,23);">&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;fields&quot; </span>: [<br />      {<br />        <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;ID_DIA&quot;</span>,<br />        <span style="color: rgb(135,16,148);">&quot;dataType&quot; </span>: <span style="color: rgb(6,125,23);">&quot;BigDecimal&quot;</span>,<br />        <span style="color: rgb(135,16,148);">&quot;transformation&quot; </span>: {<br />          <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;EXP_TO_DECIMAL&quot;</span>,<br />          <span style="color: rgb(135,16,148);">&quot;parameters&quot; </span>: [<br />           .....<br />           ]<br />         }<br />       },<br />      ....<br />     ]<br />   }</pre></td>
<td colspan="1">
<pre><span style="color: rgb(135,16,148);">&quot;sources&quot; </span>: [<br />  {<br />    <span style="color: rgb(135,16,148);">&quot;name&quot; </span>: <span style="color: rgb(6,125,23);">&quot;JV_tx&quot;</span>,<br />    <span style="color: rgb(135,16,148);">&quot;type&quot; </span>: <span style="color: rgb(6,125,23);">&quot;java&quot;<br /></span><span style="color: rgb(6,125,23);">  </span>}<br />]</pre></td>
<td colspan="1"><br /></td>
<td colspan="1">
<div class="content-wrapper">
<p><em>screenshot not exported</em></p></div></td></tr></tbody></table>
<p><br /></p>

### Lookups (Version 2 only)

The Lookup transformation is a transformation action, that look ups data in any source, in scope of DWH in a table.
According to the [Informatica Lookup transformation guide](https://docs.informatica.com/data-quality-and-governance/informatica-data-quality/10-5/developer-transformation-guide/lookup-transformation.html):

1) Connected. They have direct connections with Input/Output ports of neighbor transformations via Connector entities.
   Their return output can be multiple and involved by multiple fields in further transformations.

![connected_lookup.png](doc/connected_lookup.png)

2) Unconnected. They have not Connectors, rather they are invoked by name from other blocks' expressions. Since they are
   invoked just other functions they return one value.

```text
EXPRESSION ="IIF(ISNULL(:LKP.LKP_ODS_TVA_71_SALDOS_MOV_IMP_OPERACION(NUM_CTA_VALORES, FCH_CONTABLE, REFERENCIA..."
```

![disconnected_lookup.png](doc/disconnected_lookup.png)

XML Parser identifies a lookup as an atomic transformation element on field level with specific set of attributes:

- **name**
- **outputField** - a field from the lookup result record needed to be passed as a return value
- **table** - lookup table
- **condition** - lookup condition with input field values
- **sourceFilter** - lookup filtering
- **sqlOverride** - custom lookup SQL statement
- **parameters** - list of input fields required for the lookup

Recipe example (from the anonymized corpus):

```json
{
  "name": "LKP_DWH_MAPLEGROVE_HOLDINGS_FIRGATE",
  "outputField": "ID_ENTITYREF_FIRGATE",
  "table": "DWH_MAPLEGROVE_HOLDINGS_FIRGATE",
  "condition": "ID_ENTITYREF_FIRGATE = ELMWICK3FLINTGROVE AND ID_HOLDINGS_FIRGATE = ELMWICK3COD AND FCH_DATAENTRY = ELMWICK3OLIVEYARD",
  "matchPolicy": "Any",
  "parameters": [
    {
      "name": "ELMWICK3FLINTGROVE",
      "dataType": "String",
      "transformation": {
        "source": "SQ_ODS_FIRGATE3.ELMWICK3FLINTGROVE"
      }
    }
  ]
}
```

---

### Global transformations (Version 1, Version 2 - TBC)

Currently we consider global reusable transformation defined in the IPC folder p_DWH_ODS.

They are expected to be used in STG → ODS layer, DQ1a, DQ1b control checking.

Technically global transformation can be identified by the following algorithm's condition:

```scala
&& folder
.transformation.contains(transformation)
  && transformField.portType == Output
=>
// Predefined Expression class from the global transformation list
processGlobalTransformationExpression(transformationList, folder, mappable, currentTransformation, currentInstance)

....

private def processGlobalTransformationExpression(
                                                   transformationList: List[RecipeTransformationField],
                                                   folder: Folder,
                                                   mappable: Mappable,
                                                   currentTransformation: Transformation,
                                                   currentInstance: Instance
): (Option[String], List[RecipeTransformationField]) = {

  val currentList: List[RecipeTransformationField] =
    RecipeTransformationField(currentTransformation.name, None) +: transformationList

  // TODO: Placeholder for implementing multiple inputs
  val inputTransformedField = currentTransformation.transformFields
    .filter(_.portType.contains(Input))
    .filter(!_.name.contains(FieldName))
    .head

  extractTransformations(
    currentList,
    folder,
    mappable,
    currentInstance,
    Option(inputTransformedField.name)
  )
}
```

---

### Simple transformations - expressions (Version 1, Version 2 - TBC)

To identify any essential inline expressions, which modify data the following condition is used:

```scala
&& transformedField
.portType == Output
=>
// Mapplet simple expression
processSimpleTransformationExpression(
  transformationList,
  folder,
  mappable,
  currentTransformation,
  currentInstance,
  outputTransformedField
)

.....

private def processSimpleTransformationExpression(
                                                   transformationList: List[RecipeTransformationField],
                                                   folder: Folder,
                                                   mappable: Mappable,
                                                   currentTransformation: Transformation,
                                                   currentInstance: Instance,
                                                   outputTransformedField: TransformField
): (Option[String], List[RecipeTransformationField]) = {

  val inputField = currentTransformation.transformFields
    .filter(_.portType.contains(Input))
    .map(_.name)
    .find { fieldName =>
      val pattern: Regex = s"\\b$fieldName\\b".r
      pattern.findFirstIn(outputTransformedField.expression).isDefined
    }

  val currentTransformations =
    lookupPredefinedExpression(outputTransformedField.expression, inputField.getOrElse(""))

  val currentTransformList = currentTransformations ++: transformationList

  extractTransformations(currentTransformList, folder, mappable, currentInstance, inputField)
}
```

Currently the parser is able to identify the following list of simple Transformation language expression functions
(adding prefix "EXP_" to the emitted recipe transformation names, see
[ExpressionParsing.scala](recipe/expression/ExpressionParsing.scala)):

- EXP_SUBSTR
- EXP_LENGTH
- EXP_ISNULL
- EXP_TO_CHAR (for both Dates and Numbers)
- EXP_TO_DECIMAL
- EXP_ARITHMETIC (+ - / *)
- EXP_TO_INTEGER
- EXP_TO_DATE
- EXP_RPAD
- EXP_LPAD
- EXP_LOGICAL (and/AND/or/OR)
- EXP_COMPARISON ( > < = != >= <= <> )
- EXP_IIF
- EXP_TRIM
- EXP_LOWER
- EXP_UPPER
- EXP_REPLACECHR
- EXP_REPLACESTR
- EXP_CONCAT
- EXP_NOT
- EXP_IS_NUMBER
- EXP_TRUNC

---

### Sequence Generator

```scala
// ID sequence generator
(None, RecipeTransformationField(SequenceGenerator, None) +: transformationList)
```

Sequence Generator is not implemented as in IPC and returning a static "12345"

---

## Transformations engine (Version 1)

> **Note:** the runtime engine described below (`Processor`, `CompositeProcessor`, the `EXP_*`
> implementations) is **not part of this repository** — it lives in the original spark-etl
> project. This section is kept to document how the generated `_ETL_*.json` recipes are
> consumed downstream.

### General overview

The basic interface for all transformations and atomic expressions is `Processor[Input, Output]`:

```scala
val logger: Logger = LoggerFactory getLogger getClass.getName

def process(input: Input, params: String*): Either[String, Output]
```

where Input - type of input data to be transformed,  
Output - type of produced transformation result,  
params - String varargs containing any required parameters to perform the atomic transformation.

Example of global transformation class:

```scala
/**
 * This expression validates that NUM values is number if it is not null.
 * If it isn't number, this expression populates error fields.
 */
object EXP_VALIDATION_NUM extends Processor[String, BigDecimal] with Serializable {

  override def process(input: String, params: String*): Either[String, BigDecimal] = {
    if (isNullOrTrimEmpty(input)) Right(null)
    else if (isNumber(input)) Right(BigDecimal(input.trim))
    else Left(s"$CODE_ERROR_NUMBER$FIELD_SEPARATOR$input")
  }

}
```

Example of atomic expression class:

```scala
/**
 * This transformation implements Informatica TO_INTEGER function
 * https://docs.informatica.com/data-quality-and-governance/informatica-data-quality/10-5/transformation-language-reference/functions/to_integer.html
 *
 * Simplification: truncate flag is not used
 *
 * Input type: any of Number or String
 * Output type: Integer
 *
 */
object EXP_TO_INTEGER extends Processor[AnyRef, Integer] with Serializable {

  override def process(input: AnyRef, params: String*): Either[String, Integer] = input match {
    case null => Right(null)
    case number: Number => Right(number.intValue())
    case str: String =>
      Try {
        BigDecimal(str.trim).intValue()
      } match {
        case Success(value) => Right(value)
        case Failure(_) => Left(ERROR_TRANSFORMATION)
      }
    case _ => Left(ERROR_TRANSFORMATION)
  }

}
```

To process a chain of transformations and/or expressions the Composite Processor is used:

```scala
/**
 * This processors aggregates other processors to be invoked in a chain
 *
 * TODO: to decouple error message populating from this chain. This populating should be performed on DQ level checking, i.e. on ETL Recipe applying layer
 *
 * @param processors - list of processors to be invoked
 * @param sourceField - name of source field to populate error message
 */
case class CompositeProcessor(
                               processors: List[(Processor[_, _], Seq[String])],
                               sourceField: String
                             ) extends Processor[AnyRef, AnyRef] with Serializable {

  override def process(input: AnyRef, params: String*): Either[String, AnyRef] = {
    val result = Try {
      processors.foldLeft[Either[String, AnyRef]](Right(input)) {
        case (Right(intermediaryInput), (processor, params)) =>
          val p = processor.asInstanceOf[Processor[AnyRef, AnyRef]]
          p.process(intermediaryInput, params: _*)
        case (err@Left(_), _) => err
      }
    } match {
      case Success(value) => value
      case Failure(exception) =>
        logger.error(ERROR_TRANSFORMATION, exception)
        Left(ERROR_TRANSFORMATION)
    }

    result.left.map(err => s"$sourceField$FIELD_SEPARATOR$err")
  }
}
```

To calculate transformations parameters in case of nested functions the following method is used:

```scala
/**
 * This method calculates the inline parameter value, which is represented by expression or chain of expressions.
 * For example: "EXP_TO_CHAR()|EXP_LENGTH()|EXP_ARITHMETIC(-,2)"
 *
 * In case of atomic string, number, etc. value, the engine just propagates it.
 *
 * @param input - input field value, required for inline expression calculation
 * @param param - param value String
 * @return - calculated param value
 */
def calculateParamTransformation(input: AnyRef, param: String): AnyRef = param match {
  case null => null
  case param if param.contains("EXP_") =>
    CompositeProcessor(
      splitParametersWithNestedFunction(param, '|', isTrimmed = false).map { nestedExp =>
        val expPattern = """(EXP_\w+)\((.*?)\)""".r
        nestedExp match {
          case expPattern(expName, expParameters) =>
            val expProcessor = TransformationFactory.getTransformation(expName)
            val expParametersList = splitParametersWithNestedFunction(expParameters, ',', isTrimmed = false)
            (expProcessor, expParametersList)
        }
      },
      "DUMMY_FIELD"
    ).process(input).getOrElse(param)
  case _ if isNumber(param) => BigDecimal(param)
  case _ => param
}
```

Let's consider several examples how ETL Recipe's transformations are invoked and calculated:

1)

```json
{
  "targetField": {
    "name": "ID_CLIENTE",
    "dataType": "number(p,s)",
    "dataTypeBQ": "NUMERIC"
  },
  "dq1a": [
    {
      "name": "EXP_VALIDATION_NUM_NOT_NULL"
    },
    {
      "name": "EXP_TO_CHAR"
    },
    {
      "name": "EXP_SUBSTR",
      "parameters": [
        "1",
        "EXP_TO_CHAR()|EXP_LENGTH()|EXP_ARITHMETIC(-,2)"
      ]
    },
    {
      "name": "EXP_TO_DECIMAL"
    }
  ],
  "sourceField": {
    "name": "ID_CLIENTE",
    "dataType": "varchar2",
    "dataTypeBQ": "STRING",
    "table": "STG_REL_CLIENTE_GESTOR"
  }
}
```

![_CompositeProcessor_for_IPC_EXP](doc/_CompositeProcessor_for_IPC_EXP.png)


