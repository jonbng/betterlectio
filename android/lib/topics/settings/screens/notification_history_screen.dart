import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:betterlectio/notifications/history/history.dart';
import 'package:betterlectio/notifications/history/history_entry.dart';
import 'package:betterlectio/topics/state/empty.dart';
import 'package:betterlectio/topics/state/loading.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';

class NotificationHistoryScreen extends StatefulWidget {
  const NotificationHistoryScreen({super.key});

  @override
  State<NotificationHistoryScreen> createState() =>
      _NotificationHistoryScreenState();
}

class _NotificationHistoryScreenState extends State<NotificationHistoryScreen> {
  List<HistoryEntry>? entries;

  @override
  void initState() {
    super.initState();
    loadData();
  }

  void loadData() async {
    debugPrint("refreshing");
    entries = await NotificationHistory().entries();
    entries?.sort(
      (a, b) {
        return b.time.compareTo(a.time);
      },
    );

    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BlAppbar(title: "Notifikations historik"),
      body: RefreshIndicator(
                  onRefresh: () async {
                    loadData();
                  },
                  child: entries != null
          ? entries!.isEmpty
              ? const EmptyScreen()
              :  ListView.builder(
                    itemCount: entries!.length,
                    itemBuilder: (context, index) {
                      var entry = entries![index];
                      return ListTile(
                        subtitle: Text(
                            "Nye notifikationer: ${entry.newData ? "ja" : "nej"}, fejl: ${entry.error ? "ja" : "nej"}"),
                        title: Text(DateFormat("dd/MM/yyyy HH:mm")
                            .format(entries![index].time)),
                      );
                    },
                  ) : LoadingScreen()
                
          
    ));
  }
}
