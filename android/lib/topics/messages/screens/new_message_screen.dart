import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/message/meta/meta.dart';
import 'package:betterlectio/topics/messages/bloc/new_message_bloc.dart';
import 'package:betterlectio/topics/messages/screens/content_screen.dart';
import 'package:betterlectio/topics/messages/screens/search_receivers.dart';
import 'package:betterlectio/topics/state/loading.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/layout/tabbar.dart';
import 'package:betterlectio/widgets/list/alphabetic_list.dart';

class NewMessageScreen extends StatefulWidget {
  const NewMessageScreen({super.key});

  @override
  State<NewMessageScreen> createState() => _NewMessageScreenState();
}

class _NewMessageScreenState extends State<NewMessageScreen>
    with SingleTickerProviderStateMixin {
  late TabController _controller;
  String search = "";
  @override
  void initState() {
    super.initState();
    _controller = TabController(length: 6, vsync: this, initialIndex: 1);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BlAppbar(
          title: "Vælg modtagere",
          bottom:
              BlTabBar(scrollable: true, controller: _controller, tabs: const [
            "Valgte",
            "Favoritter",
            "Elever",
            "Lærere",
            "Hold",
            "Grupper",
          ])),
      body: BlocBuilder<NewMessageBloc, NewMessageState>(
        builder: (context, state) {
          if (state.loading) {
            return const LoadingScreen();
          }
          var data = state.data!;
          List<List<MetaDataEntry>> screens = [
            state.receivers,
            data.favorites,
            data.students,
            data.teachers,
            data.teams,
            data.groups,
          ];
          var valid = state.receivers.isNotEmpty;
          return Scaffold(
            floatingActionButton: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8.0),
                  child: FloatingActionButton(
                    onPressed: () {
                      showSearch(context: context, delegate: SearchReceivers());
                    },
                    child: const Icon(EvaIcons.searchOutline),
                  ),
                ),
                FloatingActionButton.extended(
                  heroTag: "next",
                  backgroundColor: !valid
                      ? Theme.of(context).colorScheme.surfaceContainerHighest
                      : null,
                  foregroundColor: !valid
                      ? Theme.of(context).colorScheme.onSurfaceVariant
                      : null,
                  onPressed: valid
                      ? () {
                          Navigator.push(
                              context, adRoute(const MessageContentScreen()));
                        }
                      : null,
                  label: const Text("Næste"),
                ),
              ],
            ),
            body: SizedBox.expand(
                child: TabBarView(
                    controller: _controller,
                    children: screens.map((entries) {
                      return AlphabeticList<MetaDataEntry>(
                        itemBuilder: (context, person) {
                          var checked = state.receivers.contains(person);
                          return ReceiverTile(
                            checked: checked,
                            person: person,
                          );
                        },
                        list: entries
                            .map((e) => AssociatedObject(e.name, e))
                            .toList(),
                      );
                    }).toList())),
          );
        },
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}

class ReceiverTile extends StatelessWidget {
  const ReceiverTile({
    super.key,
    required this.checked,
    required this.person,
  });

  final bool checked;
  final MetaDataEntry person;

  @override
  Widget build(BuildContext context) {
    return CheckboxListTile(
      value: checked,
      onChanged: (value) {
        context
            .read<NewMessageBloc>()
            .add(checked ? RemovePerson(person) : AddPerson(person));
      },
      subtitle:
          person.classOrInitials != null ? Text(person.classOrInitials!) : null,
      title: Text(person.name),
    );
  }
}
